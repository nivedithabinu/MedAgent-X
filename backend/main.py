import os
import json
import io
import time
import uuid
import numpy as np
import requests
import traceback

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from pypdf import PdfReader
from fastapi.responses import StreamingResponse
from pptx import Presentation

load_dotenv(override=True)

app = FastAPI(title="MedAgent-X API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str
    doc_id: str

class DocRequest(BaseModel):
    doc_id: str

vector_db = {}

class AIResponse:
    def __init__(self, text):
        self.text = text

def get_clean_key():
    raw_key = os.getenv("GEMINI_API_KEY", "")
    clean_key = raw_key.replace('"', '').replace("'", "").replace("Bearer ", "").strip()
    
    if not clean_key:
        raise ValueError("GEMINI_API_KEY is missing or invalid.")
    
    return clean_key

def generate_with_retry(prompt: str, instruction: str, response_mime_type: str = "text/plain"):
    api_key = get_clean_key()

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}

    payload = {
        "systemInstruction": {"parts": [{"text": instruction}]},
        "contents": [{"parts": [{"text": prompt}]}],
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": response_mime_type
        }
    }
    
    for attempt in range(3):
        try:
            res = requests.post(url, json=payload, headers=headers)
            
            if res.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            
            res.raise_for_status()
            data = res.json()
            
            candidates = data.get("candidates", [])
            if not candidates:
                return AIResponse("Analysis unavailable due to content filtering or empty response from API.")
                
            text_content = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            if not text_content:
                 return AIResponse("No text content returned from the API.")

            return AIResponse(text_content)
            
        except Exception as e:
            if attempt == 2:
                masked_key = f"{api_key[:4]}...{api_key[-4:]}" if api_key else "NONE"
                error_msg = res.text if 'res' in locals() and hasattr(res, 'text') else str(e)
                raise Exception(f"[Key used: {masked_key}] Gemini API Error: {error_msg}")

def get_embeddings_batch(texts: list):
    api_key = get_clean_key()

    url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key={api_key}"
    headers = {"Content-Type": "application/json"}

    valid_texts = [t.strip() for t in texts if t and t.strip()]

    if not valid_texts:
        return []

    requests_list = [
        {
            "model": "models/text-embedding-004",
            "content": {"parts": [{"text": t}]}
        }
        for t in valid_texts
    ]
    
    response = requests.post(url, headers=headers, json={"requests": requests_list})

    if not response.ok:
        masked_key = f"{api_key[:4]}...{api_key[-4:]}"
        raise Exception(f"[Key used: {masked_key}] Embedding API Error: {response.text}")

    data = response.json()
    return [np.array(emb["values"]) for emb in data.get("embeddings", [])]

@app.get("/")
def read_root():
    return {
        "status": "MedAgent-X Enterprise Backend Online",
        "version": "1.0.0"
    }

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Must be a PDF file.")
        
    try:
        content = await file.read()
        pdf = PdfReader(io.BytesIO(content))
        full_text = ""

        # Defensive PDF Extraction
        for i, page in enumerate(pdf.pages): 
            try:
                text = page.extract_text()
                if text:
                    full_text = full_text + f"\n--- [PAGE {i+1}] ---\n{text.strip()}\n"

            except Exception as e:
                print(f"Skipping page {i+1} due to extraction error: {e}")
                continue
                
        if not full_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF.")

        # Agentic Verification Step
        first_page = full_text[:1000]
        prompt = f"Analyze this text snippet: \"{first_page}\". Is this highly likely related to Medical, Health, or Biological sciences? Reply with exactly YES or NO."
        
        try:
            response = generate_with_retry(prompt, "You are a strict medical classifier.")
            response_text = response.text if response else "YES"

        except Exception as e:
            print(f"Warning: Classification failed ({e}), proceeding anyway.")
            response_text = "YES"
        
        if "YES" not in response_text.strip().upper():
            raise HTTPException(status_code=403, detail="Document rejected: Content does not appear to be medical research.")

        # Semantic Chunking
        chunk_size = 1500
        chunks = [full_text[i:i+chunk_size] for i in range(0, len(full_text), chunk_size)][:20]
        chunks = [c.strip() for c in chunks if c and c.strip()]

        try:
            embeddings = []
            for i in chunks:
                e = get_embeddings_batch(i)
                embeddings.append(np.array(e))
                time.sleep(0.5)
        
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

        if not embeddings:
            raise HTTPException(status_code=500, detail="Failed to generate embeddings: No valid data returned.")

        doc_id = str(uuid.uuid4())

        vector_db[doc_id] = {
            "chunks": chunks,
            "embeddings": embeddings,
            "full_text": full_text[:25000],
            "ppt": None,
            "graph": None
        }

        return {
            "doc_id": doc_id, 
            "filename": file.filename, 
            "pages_count": len(pdf.pages)
        }

    except HTTPException as e:
        raise e

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.post("/api/chat")
async def chat_with_agent(req: QueryRequest):
    if req.doc_id not in vector_db:
        raise HTTPException(status_code=404, detail="Session expired. Please re-upload the document.")
    
    doc_data = vector_db[req.doc_id]
    
    try:
        # Custom Vector Search (Cosine Similarity)
        query_emb = get_embeddings(req.query)
        
        # Ensure correct shapes for numpy
        query_emb_np = np.array(query_emb)
        doc_embs_np = np.array(doc_data["embeddings"])
        
        similarities = [np.dot(query_emb_np, doc_emb) / (np.linalg.norm(query_emb_np) * np.linalg.norm(doc_emb)) for doc_emb in doc_embs_np]
        
        # Retrieve top 4 most relevant chunks
        top_indices = np.argsort(similarities)[-4:][::-1]
        relevant_context = "\n\n...\n\n".join([doc_data["chunks"][i] for i in top_indices])
        
        prompt = f"User Query: {req.query}\n\nRelevant Document Context:\n{relevant_context}"
        instruction = """You are MedAgent-X, an advanced Clinical AI assistant.
        1. If the query relates to the provided Document Context, answer using the context and explicitly cite the [PAGE X] markers.
        2. If the query is a general question (e.g., coding, math, casual conversation), ignore the document and answer using your broad general knowledge.
        3. Always be professional, clear, and highly helpful."""
        
        response = generate_with_retry(prompt, instruction)

        return {
            "reply": response.text
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Chat engine encountered an error: {str(e)}")

@app.post("/api/generate-graph")
async def generate_graph(req: DocRequest):
    try:
        if req.doc_id not in vector_db:
            raise HTTPException(status_code=404, detail="Document not found.")
        
        if vector_db[req.doc_id]["graph"]:
            return {
                "mermaid_code": vector_db[req.doc_id]["graph"]
            }

        prompt = f"Analyze this medical text and create a Mermaid.js mindmap showing core disease, symptoms, treatments. Start with 'mindmap' on line 1. Keep nodes short. Text: {vector_db[req.doc_id]['full_text'][:15000]}"
        response = generate_with_retry(prompt, "Output ONLY valid mermaid mindmap code. No markdown blocks.")
        
        mermaid_code = response.text.replace("```mermaid", "").replace("```", "").strip()
        vector_db[req.doc_id]["graph"] = mermaid_code

        return {
            "mermaid_code": mermaid_code
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Graph Generation Failed")

@app.post("/api/generate-ppt")
async def generate_ppt(req: DocRequest):
    try:
        if req.doc_id not in vector_db:
            raise HTTPException(status_code=404, detail="Document not found.")

        if vector_db[req.doc_id]["ppt"]:
            return {
                "slides": vector_db[req.doc_id]["ppt"]
            }

        prompt = f"Create a 5 slide presentation summarizing core findings. Schema: [{{ 'title': 'Title', 'bullets': ['pt1', 'pt2'], 'icon': 'ph-pill' }}]. Text: {vector_db[req.doc_id]['full_text'][:15000]}"
        response = generate_with_retry(prompt, "Output strictly a JSON array.", "application/json")
        
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        slides = json.loads(clean_text)
        vector_db[req.doc_id]["ppt"] = slides
    
        return {
            "slides": slides
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="PPT Generation Failed")

@app.post("/api/export-ppt")
async def export_ppt(req: DocRequest):
    try:
        if req.doc_id not in vector_db or not vector_db[req.doc_id].get("ppt"):
            raise HTTPException(status_code=404, detail="Please generate the PPT in the UI first.")
            
        slides_data = vector_db[req.doc_id]["ppt"]
        prs = Presentation()

        for slide_data in slides_data:
            slide = prs.slides.add_slide(prs.slide_layouts[1]) 

            title_shape = slide.shapes.title
            if title_shape:
                title_shape.text = slide_data.get("title", "Slide")

            # Defensive Placeholder checking
            if len(slide.shapes.placeholders) > 1:
                body_shape = slide.shapes.placeholders[1]
                t = body_shape.text_frame
                bullets = slide_data.get("bullets", [])
                
                if bullets:
                    t.clear()
                    for bullet in bullets:
                        p = t.add_paragraph()
                        p.text = str(bullet)
                        p.level = 0
            else:
                print(f"Warning: Layout for slide '{slide_data.get('title')}' is missing a content placeholder.")
                        
        ppt_stream = io.BytesIO()
        prs.save(ppt_stream)
        ppt_stream.seek(0)

        return StreamingResponse(
            ppt_stream,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": "attachment; filename=MedAgent_Export.pptx"}
        )
        
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Export Failed")
