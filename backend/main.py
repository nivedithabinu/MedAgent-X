import os
import json
import io
import time
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from pypdf import PdfReader

import google.generativeai as genai

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
    context: str

class ContextRequest(BaseModel):
    context: str

# Globally configure the Gemini API key safely
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    # 1. Clean the key (Render sometimes includes accidental quotes)
    clean_key = api_key.replace('"', '').replace("'", "").strip()
    # 2. Force 'rest' transport to bypass the gRPC OAuth glitch!
    genai.configure(api_key=clean_key, transport="rest")

def generate_with_retry(prompt, instruction, response_mime_type="text/plain"):
    if not api_key:
        raise ValueError("GEMINI_API_KEY is missing in Render environment.")
    
    # Using classic GenerativeModel which prevents the OAuth token bug
    model = genai.GenerativeModel('gemini-2.5-flash')
    
    # Embed instruction directly into the prompt to guarantee it works on any SDK version
    full_prompt = f"System Instruction: {instruction}\n\nTask: {prompt}"
    if response_mime_type == "application/json":
        full_prompt += "\n\nCRITICAL: You MUST output ONLY valid JSON format."

    for attempt in range(2):
        try:
            response = model.generate_content(full_prompt)
            return response
        except Exception as e:
            error_str = str(e).lower()
            if "429" in error_str or "quota" in error_str or "exhausted" in error_str:
                if attempt == 0:
                    print("⚠️ 429 Quota Hit! Pausing for 15s...")
                    time.sleep(15)
                    continue
            raise e

@app.get("/")
def read_root():
    return {"status": "Backend is live!"}

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Must be a PDF")
        
    try:
        content = await file.read()
        pdf = PdfReader(io.BytesIO(content))
        
        pages_data = []
        for i, page in enumerate(pdf.pages[:10]): 
            text = page.extract_text()
            if text:
                pages_data.append({"page": i + 1, "text": text.strip()})
                
        if not pages_data:
            raise HTTPException(status_code=400, detail="Could not extract text")

        first_page = pages_data[0]["text"][:500]
        prompt = f"Analyze this text snippet: \"{first_page}\". Is this highly likely related to Medical/Health sciences? Reply with exactly YES or NO."
        response = generate_with_retry(prompt, "You are a strict medical classifier.")
        
        if "YES" not in response.text.strip().upper():
            raise HTTPException(status_code=403, detail="Rejected: Not a medical document.")

        return {"filename": file.filename, "pages": pages_data}
    except Exception as e:
        print(f"Upload Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat_with_agent(req: QueryRequest):
    prompt = f"User Query: {req.query}\nDocument Context:\n{req.context[:15000]}"
    try:
        response = generate_with_retry(prompt, "You are a medical AI assistant. Always cite page numbers from context.")
        return {"reply": response.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-graph")
async def generate_graph(req: ContextRequest):
    prompt = f"Analyze this medical text and create a Mermaid.js mindmap showing core disease, symptoms, treatments. Start with 'mindmap' on line 1. Text: {req.context[:8000]}"
    try:
        response = generate_with_retry(prompt, "Output ONLY valid mermaid mindmap code. No markdown blocks.")
        mermaid_code = response.text.replace("```mermaid", "").replace("```", "").strip()
        return {"mermaid_code": mermaid_code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-ppt")
async def generate_ppt(req: ContextRequest):
    prompt = f"Create a 5 slide presentation summarizing core findings. Schema: [{{ 'title': 'Title', 'bullets': ['pt1', 'pt2'], 'icon': 'ph-pill' }}]. Text: {req.context[:8000]}"
    try:
        response = generate_with_retry(prompt, "Output strictly a JSON array.")
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        return {"slides": json.loads(clean_text)}
    except Exception as e:
        print(f"PPT Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse PPT JSON from AI.")
