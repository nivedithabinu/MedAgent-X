import os
import json
import io
import time
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from pypdf import PdfReader
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

# Models
class QueryRequest(BaseModel):
    query: str
    context: str

class ContextRequest(BaseModel):
    context: str

# Helper: Auto-Retry for 429 Quota Errors & Resiliency
def generate_with_retry(prompt, instruction, response_mime_type="text/plain"):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is missing in the Render environment.")
    
    client = genai.Client(api_key=api_key)
    
    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=instruction,
                    response_mime_type=response_mime_type
                )
            )
            return response
        except Exception as e:
            error_str = str(e).lower()
            if "429" in error_str or "quota" in error_str or "exhausted" in error_str:
                if attempt == 0:
                    print("⚠️ 429 Quota Hit! Pausing for 15 seconds...")
                    time.sleep(15)  # Wait out the rate limit
                    continue
            raise e

@app.get("/")
def read_root():
    return {"status": "MedAgent-X Backend is live and ready!"}

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file received.")
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")
        
    try:
        content = await file.read()
        pdf = PdfReader(io.BytesIO(content))
        
        pages_data = []

        for i, page in enumerate(pdf.pages[:10]): 
            text = page.extract_text()
            if text:
                pages_data.append({"page": i + 1, "text": text.strip()})
                
        if not pages_data:
            raise HTTPException(status_code=400, detail="Could not extract text from PDF")

        # Verify it is medical
        first_page_text = pages_data[0]["text"][:500]
        prompt = f"Analyze this text snippet: \"{first_page_text}\". Is this document highly likely related to the Medical, Health, or Biological sciences industry? Reply with exactly YES or NO."
        
        response = generate_with_retry(prompt, "You are a strict medical classifier.")
        if "YES" not in response.text.strip().upper():
            raise HTTPException(status_code=403, detail="Document rejected: Not a medical document.")

        return {"filename": file.filename, "pages": pages_data}
    except Exception as e:
        print(f"Upload Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat_with_agent(req: QueryRequest):
    prompt = f"""
    User Query: "{req.query}"
    Use the following context from the uploaded medical document to answer the query accurately.
    CRITICAL INSTRUCTION: You MUST cite the page number for your claims based on the provided context (e.g., "[Page 3]").
    If the answer is not in the context, state that clearly. Format your response in clean Markdown.

    Document Context:
    {req.context}
    """
    try:
        response = generate_with_retry(prompt, "You are a medical AI assistant. Always cite page numbers from context.")
        return {"reply": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-graph")
async def generate_graph(req: ContextRequest):
    # Truncate context to 10k chars to ensure it doesn't timeout
    prompt = f"""
    Analyze the following medical text and create a comprehensive Mermaid.js mindmap showing the core disease, symptoms, treatments, and mechanisms discussed. 
    Use strictly valid Mermaid mindmap syntax. Do not use markdown blocks (```). Just output the raw mermaid code.
    Start with 'mindmap' on the first line. 
    
    Text Context:
    {req.context[:10000]}
    """
    try:
        response = generate_with_retry(prompt, "You are a medical data structurer. Output ONLY valid mermaid mindmap code.")
        mermaid_code = response.text.replace("```mermaid", "").replace("```", "").strip()
        return {"mermaid_code": mermaid_code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-ppt")
async def generate_ppt(req: ContextRequest):
    # Truncate context to 10k chars to ensure fast PPT generation
    prompt = f"""
    Analyze this medical research text and create a 5 slide presentation summarizing the core findings.
    Return a JSON array where each object represents a slide. 
    Schema: [{{ "title": "Slide Title", "bullets": ["point 1", "point 2"], "icon": "ph-pill" }}]
    Choose an appropriate phosphor icon name (like ph-heartbeat, ph-virus, ph-pill, ph-flask, etc) for each slide.
    
    Text Context:
    {req.context[:10000]}
    """
    try:
        response = generate_with_retry(prompt, "You are a medical presenter. Output strictly a JSON array.", response_mime_type="application/json")
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        ppt_data = json.loads(clean_text)
        return {"slides": ppt_data}
    except Exception as e:
        print(f"PPT Generation Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse PPT JSON from AI. Please try again.")
