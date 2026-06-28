import os
import json
import io
import antigravity
import google.genai
import traceback
import re
import time

print("google-genai version:", google.genai.__version__)

from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from pypdf import PdfReader
from google import genai
from google.genai import types

# load_dotenv(override=True)

app = FastAPI(title="MedAgent-X API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows any frontend port (e.g., localhost:5500)
    allow_credentials=False, # MUST BE FALSE when allow_origins is ["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

api_key = os.environ.get("GEMINI_API_KEY")

print("ALL GEMINI ENV VARS:")
for i, j in os.environ.items():
    if "GEMINI" in i.upper() or "GOOGLE" in i.upper():
        print(i, "=", j[:10] 
              if j 
              else 
              None)

if api_key and api_key != "your_api_key_here":
    print(f"✅ SUCCESS: API Key loaded correctly!")
else:
    print("❌ ERROR: Invalid API Key!")

try:
    gemini_client = genai.Client(api_key=api_key)
except Exception as e:
    print(f"Warning: Could not initialize Gemini Client: {e}")
    gemini_client = None

class QueryRequest(BaseModel):
    query: str
    context: str

class ContextRequest(BaseModel):
    context: str

def get_gemini_model(key, instruction, response_mime_type="text/plain"):
    actual_key = key if key else api_key
    if not actual_key:
        raise ValueError("No Gemini API key provided.")
        
    client = genai.Client(api_key=actual_key)
    
    class ModelWrapper:
        def generate_content(self, prompt):
            return client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=instruction,
                    response_mime_type=response_mime_type
                )
            )
    return ModelWrapper()

@app.get("/")
def read_root():
    return {"status": "MedAgent-X Backend is running in Antigravity mode! 🌌"}

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...), x_gemini_key: str = Header(None)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    content = await file.read()
    pdf = PdfReader(io.BytesIO(content))
    
    pages_data = []

    for i, page in enumerate(pdf.pages[:10]):
        text = page.extract_text()
        if text:
            pages_data.append({"page": i + 1, "text": text})
            
    if not pages_data:
        raise HTTPException(status_code=400, detail="Could not extract text from PDF")

    # Agentic Verification: Is it Medical?
    first_page_text = pages_data[0]["text"][:500]
    prompt = f"Analyze this text snippet: \"{first_page_text}\". Is this document highly likely related to the Medical, Health, or Biological sciences industry? Reply with exactly YES or NO."
    
    try:
        model = get_gemini_model(x_gemini_key, "You are a strict medical classifier.")
        response = model.generate_content(prompt)

        if response.text.strip().upper() != "YES":
            raise HTTPException(status_code=403, detail="Document rejected: Not a medical document.")

    except Exception as e:
        print("========== GEMINI ERROR ==========")
        traceback.print_exc()
        print("==================================")
        
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "filename": file.filename, 
        "pages": pages_data, 
        "message": "Medical document verified and parsed successfully."
    }

@app.post("/api/chat")
async def chat_with_agent(req: QueryRequest, x_gemini_key: str = Header(None)):
    prompt = f"""
    User Query: "{req.query}"
    
    Use the following context from the uploaded medical document to answer the query accurately.
    CRITICAL INSTRUCTION: You MUST cite the page number for your claims based on the provided context (e.g., "[Page 3]").
    If the answer is not in the context, state that clearly. Format your response in clean Markdown.

    Document Context:
    {req.context}
    """
    try:
        model = get_gemini_model(x_gemini_key, "You are a medical AI assistant. Always cite page numbers from context.")
        response = model.generate_content(prompt)
        return {"reply": response.text}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-graph")
async def generate_graph(req: ContextRequest, x_gemini_key: str = Header(None)):
    prompt = f"""
You are an expert medical knowledge graph generator.

Analyze the following medical document and produce ONLY valid Mermaid mindmap code.

STRICT RULES:

- Output ONLY Mermaid code.
- Do NOT explain anything.
- Do NOT use markdown code blocks.
- The first line MUST be exactly:

mindmap

- Follow this structure exactly:

mindmap
  root((Main Disease))
    Symptoms
      Symptom 1
      Symptom 2
    Causes
      Cause 1
      Cause 2
    Diagnosis
      Method 1
      Method 2
    Treatment
      Drug 1
      Drug 2
    Prevention
      Prevention 1
    Complications
      Complication 1

Rules:
- Keep node labels short.
- Maximum depth = 3.
- Never output anything except Mermaid.

Medical Document:

{req.context}
"""
    try:
        model = get_gemini_model(
            x_gemini_key,
            "You are a medical data structurer. Output ONLY valid Mermaid mindmap code."
        )

        response = model.generate_content(prompt)

        mermaid_code = (
            response.text
            .replace("```mermaid", "")
            .replace("```", "")
            .replace("\r", "")
            .strip()
        )

        mermaid_code = re.sub(r'root\(\((.*?)\)\)', lambda m: f'root(({m.group(1).replace("(", "").replace(")", "")}))', mermaid_code)

        mermaid_code = mermaid_code.replace("[", "")
        mermaid_code = mermaid_code.replace("]", "")
        mermaid_code = mermaid_code.replace("{", "")
        mermaid_code = mermaid_code.replace("}", "")
        mermaid_code = mermaid_code.replace(":", "")
        mermaid_code = mermaid_code.replace(";", "")

        if not mermaid_code.startswith("mindmap"):
            mermaid_code = "mindmap\n" + mermaid_code

        print("========== MERMAID ==========")
        print(mermaid_code)
        print("=============================")

        return {
            "mermaid_code": mermaid_code
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-ppt")
async def generate_ppt(req: ContextRequest, x_gemini_key: str = Header(None)):
    prompt = f"""
    Analyze this medical research text and create a 5-7 slide presentation summarizing the core findings.
    Return a JSON array where each object represents a slide. 
    Schema: [{{ "title": "Slide Title", "bullets": ["point 1", "point 2"], "icon": "ph-pill" }}]
    Choose an appropriate phosphor icon name (like ph-heartbeat, ph-virus, ph-pill, ph-flask, etc) for each slide.
    
    Text Context:
    {req.context}
    """
    try:
        model = get_gemini_model(x_gemini_key, "You are a medical presenter. Output strictly a JSON array.", response_mime_type="application/json")
        response = None

        for attempt in range(5):
           try:
              response = model.generate_content(prompt)
              break
    
           except Exception as e:
               if "503" in str(e) or "UNAVAILABLE" in str(e):
                   print(f"Gemini busy... retry {attempt + 1}/5")
                   time.sleep(3)
                   continue
               raise
           
           if response is None:
              raise HTTPException(status_code=503, detail="Gemini service is temporarily busy. Please try again in a few seconds.")
        
        # Clean the response text before parsing
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        ppt_data = json.loads(clean_text)

        return {"slides": ppt_data}

    except Exception as e:
        print(f"Error parsing JSON: {e}")
        print(f"Raw response was: {response.text}")
        raise HTTPException(status_code=500, detail="Failed to parse PPT JSON")
