import os
import uuid
import fitz  # PyMuPDF
import json
import antigravity

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv(override=True)

app = FastAPI(title="MedAgent-X API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_key = os.getenv("GEMINI_API_KEY")

if api_key and api_key != "your_api_key_here":
    print(f"✅ SUCCESS: API Key loaded correctly!")
else:
    print("❌ ERROR: Invalid API Key!")

try:
    gemini_client = genai.Client(api_key=api_key)
except Exception as e:
    print(f"Warning: Could not initialize Gemini Client: {e}")
    gemini_client = None

db_documents = {}

class UploadResponse(BaseModel):
    doc_id: str
    filename: str
    num_pages: int

class ChatRequest(BaseModel):
    query: str

class ChatResponse(BaseModel):
    response: str

@app.get("/")
def read_root():
    return {"message": "MedAgent-X Backend API is running"}

@app.post("/api/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    doc_id = str(uuid.uuid4())
    
    try:
        contents = await file.read()
        pdf_doc = fitz.open(stream=contents, filetype="pdf")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read PDF: {str(e)}")
    
    max_pages = min(pdf_doc.page_count, 30)
    pages_data = []
    
    for i in range(max_pages):
        page = pdf_doc.load_page(i)
        text = page.get_text("text")
        if text.strip():
            pages_data.append({
                "page": i + 1,
                "text": text.strip()
            })
    
    pdf_doc.close()
    
    if not pages_data:
        raise HTTPException(status_code=400, detail="Could not extract text. Make sure this is a text-based PDF.")
        
    sample_text = pages_data[0]["text"][:500]
    is_medical_prompt = f'Analyze this text snippet: "{sample_text}". Is this document highly likely related to the Medical, Health, or Biological sciences industry? Reply with exactly YES or NO.'
    
    if gemini_client:
        try:
            response = gemini_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=is_medical_prompt,
                config=types.GenerateContentConfig(
                    system_instruction="You are a strict medical classifier."
                )
            )
            ai_decision = response.text.strip().upper()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Gemini API Error: {str(e)}")
            
        if "YES" not in ai_decision:
            raise HTTPException(status_code=403, detail=f"Rejected: Not a medical document. (Agent answered: {ai_decision})")
            
    full_context = "\n".join([f"--- PAGE {p['page']} ---\n{p['text']}" for p in pages_data])
    
    db_documents[doc_id] = {
        "name": file.filename,
        "pages": pages_data,
        "full_context": full_context
    }
    
    return UploadResponse(
        doc_id=doc_id,
        filename=file.filename,
        num_pages=len(pages_data)
    )

@app.post("/api/documents/{doc_id}/mindmap")
async def generate_mindmap(doc_id: str):
    if doc_id not in db_documents:
        raise HTTPException(status_code=404, detail="Document not found")
        
    doc = db_documents[doc_id]
    context_text = doc["full_context"][:15000]
    
    prompt = f"""Analyze the following medical text and create a comprehensive Mermaid.js mindmap showing the core disease, symptoms, treatments, and mechanisms discussed. 
    Use strictly valid Mermaid mindmap syntax. Do not use markdown blocks (```). Just output the raw mermaid code.
    Start with 'mindmap' on the first line. Keep nodes concise.
                
    Text Context:
    {context_text}"""
    
    try:
        response = gemini_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction="You are a medical data structurer. Output ONLY valid mermaid mindmap code."
            )
        )
        mermaid_code = response.text.replace("```mermaid", "").replace("```", "").strip()
        return {"mindmapCode": mermaid_code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/documents/{doc_id}/ppt")
async def generate_ppt(doc_id: str):
    if doc_id not in db_documents:
        raise HTTPException(status_code=404, detail="Document not found")
        
    doc = db_documents[doc_id]
    context_text = doc["full_context"][:15000]
    
    prompt = f"""Analyze this medical research text and create a 5-7 slide presentation summarizing the core findings.
    Return a JSON array where each object represents a slide. 
    Schema: [{{ "title": "Slide Title", "bullets": ["point 1", "point 2"], "icon": "ph-pill" }}]
    Choose an appropriate phosphor icon name (like ph-heartbeat, ph-virus, ph-pill, ph-flask, etc) for each slide.
                
    Text Context:
    {context_text}"""
    
    try:
        response = gemini_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction="You are a medical presenter. Output strictly a JSON array.",
                response_mime_type="application/json"
            )
        )
        ppt_data = json.loads(response.text)
        return {"pptData": ppt_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/documents/{doc_id}/chat", response_model=ChatResponse)
async def chat(doc_id: str, request: ChatRequest):
    if doc_id not in db_documents:
        raise HTTPException(status_code=404, detail="Document not found")
        
    doc = db_documents[doc_id]
    context_text = doc["full_context"][:20000]
    
    prompt = f"""You are an Agentic Medical Research Assistant. 
    User Query: "{request.query}"
            
    Use the following context from the uploaded medical document to answer the query accurately.
    CRITICAL INSTRUCTION: You MUST cite the page number for your claims based on the provided context (e.g., "[Page 3]").
    If the answer is not in the context, state that clearly. Format your response in clean Markdown.

    Document Context:
    {context_text}"""
    
    try:
        response = gemini_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction="You are a medical AI assistant. Always cite page numbers from context."
            )
        )
        return ChatResponse(response=response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))