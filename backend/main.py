import os
import json
import io
import time
import uuid
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from pypdf import PdfReader
from google import genai
from google.genai import types

from fastapi.responses import StreamingResponse
from pptx import Presentation
import io

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

# ==========================================
# ENTERPRISE STATE CACHE & VECTOR STORE
# Format: { doc_id: { "chunks": [], "embeddings": [], "full_text": "", "ppt": None, "graph": None } }
# ==========================================
vector_db = {}

api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    api_key = api_key.replace('"', '').replace("'", "").strip()

client = genai.Client(api_key=api_key) if api_key else None

def generate_with_retry(prompt: str, instruction: str, response_mime_type: str = "text/plain"):
    if not client:
        raise ValueError("GEMINI_API_KEY is missing.")
    
    for attempt in range(2):
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(system_instruction=instruction, response_mime_type=response_mime_type, temperature=0.2)
            )

            return response

        except Exception as e:
            if "429" in str(e).lower() and attempt == 0:
                print("⚠️ Quota Hit! Pausing for 15s...")
                time.sleep(15)
                continue
            raise e

@app.get("/")
def read_root():
    return {"status": "MedAgent-X Enterprise Backend Online"}

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Must be a PDF file.")
        
    try:
        content = await file.read()
        pdf = PdfReader(io.BytesIO(content))
        
        # 1. Extract ALL text efficiently
        full_text = ""
        for i, page in enumerate(pdf.pages): 
            text = page.extract_text()
            if text:
                full_text = full_text + f"\n--- [PAGE {i+1}] ---\n{text.strip()}\n"
                
        if not full_text:
            raise HTTPException(status_code=400, detail="Could not extract text from PDF.")

        # 2. Medical Verification Check
        verification_prompt = f"Analyze this text snippet: \"{full_text[:1000]}\". Is this highly likely related to Medical, Health, or Biological sciences? Reply with exactly YES or NO."
        response = generate_with_retry(verification_prompt, "You are a strict medical classifier.")

        if "YES" not in response.text.strip().upper():
            raise HTTPException(status_code=403, detail="Document rejected: Content is not medical research.")

        # 3. RAG Chunking (Split into 1500-char blocks)
        chunk_size = 1500
        chunks = [full_text[i:i+chunk_size] for i in range(0, len(full_text), chunk_size)]
        chunks = chunks[:60]

        # 4. Batch Generate Embeddings (Super Fast)
        embed_res = client.models.embed_content(model='text-embedding-004', contents=chunks)

        embeddings = [np.array(emb.values) for emb in embed_res.embeddings]

        # 5. Store in Custom Vector Database
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
    
    except Exception as e:
        print(f"Upload Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat_with_agent(req: QueryRequest):
    if req.doc_id not in vector_db:
        raise HTTPException(status_code=404, detail="Session expired. Please re-upload the document.")
    
    doc_data = vector_db[req.doc_id]
    
    try:
        # 1. Embed the user's question
        query_emb = np.array(client.models.embed_content(model='text-embedding-004', contents=req.query).embeddings[0].values)
        
        # 2. Custom Cosine Similarity Search (The math behind Vector DBs!)
        similarities = [np.dot(query_emb, doc_emb) / (np.linalg.norm(query_emb) * np.linalg.norm(doc_emb)) for doc_emb in doc_data["embeddings"]]
        
        # 3. Retrieve Top 4 Most Relevant Chunks
        top_indices = np.argsort(similarities)[-4:][::-1]
        relevant_context = "\n\n...\n\n".join([doc_data["chunks"][i] for i in top_indices])
        
        # 4. Generate Answer based ONLY on retrieved chunks
        prompt = f"User Query: {req.query}\n\nRelevant Document Context:\n{relevant_context}"
        response = generate_with_retry(prompt, "You are a clinical AI. Answer using ONLY the context provided. Always cite the [PAGE X] marker found in the context. If the answer isn't in the context, say so.")
        
        return {
            "reply": response.text
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-graph")
async def generate_graph(req: DocRequest):
    if req.doc_id not in vector_db:
        raise HTTPException(status_code=404, detail="Document not found.")
    
    # Return instantly if already generated
    if vector_db[req.doc_id]["graph"]:
        return {
            "mermaid_code": vector_db[req.doc_id]["graph"]
        } 
        
    prompt = f"Analyze this medical text and create a Mermaid.js mindmap showing core disease, symptoms, treatments. Start with 'mindmap' on line 1. Text: {vector_db[req.doc_id]['full_text'][:15000]}"

    try:
        response = generate_with_retry(prompt, "Output ONLY valid mermaid mindmap code. No markdown blocks.")
        mermaid_code = response.text.replace("```mermaid", "").replace("```", "").strip()
        
        # Save to Cache
        vector_db[req.doc_id]["graph"] = mermaid_code
        return {
            "mermaid_code": mermaid_code
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-ppt")
async def generate_ppt(req: DocRequest):
    if req.doc_id not in vector_db:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Return instantly if already generated
    if vector_db[req.doc_id]["ppt"]:
        return {
            "slides": vector_db[req.doc_id]["ppt"]
        }

    prompt = f"Create a 5 slide presentation summarizing core findings. Schema: [{{'title': 'Title', 'bullets': ['pt1', 'pt2'], 'icon': 'ph-pill' }}]. Text: {vector_db[req.doc_id]['full_text'][:15000]}"

    try:
        response = generate_with_retry(prompt, "Output strictly a JSON array.", "application/json")
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        slides = json.loads(clean_text)

        # Save to Cache
        vector_db[req.doc_id]["ppt"] = slides
        return {
            "slides": slides
        }

    except Exception as e:
        print(f"PPT Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse PPT JSON from AI.")
