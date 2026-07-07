# 🩺 MedAgent-X

> **An Agentic AI Research Assistant powered by Retrieval-Augmented Generation (RAG)**

MedAgent-X is a full-stack AI application designed to accelerate clinical research. Instead of manually navigating hundreds of pages, researchers can upload a clinical PDF, ask questions in natural language, generate knowledge graphs, and export AI-generated presentation slides—all within seconds.

---

## 🚀 Key Features

### 📄 Intelligent PDF Processing

- Upload clinical research papers in PDF format.
- Robust document parsing using **PyPDF** with defensive error handling.
- Automatically extracts and processes textual content from complex academic papers.

---

### 🤖 AI-Powered Research Chat

- Ask questions about uploaded research papers.
- Uses a custom **Retrieval-Augmented Generation (RAG)** pipeline.
- Retrieves the most relevant document chunks before generating responses.
- Explicitly cites the corresponding **page number** for every answer.

### 🧠 Knowledge Graph Generation

Automatically converts unstructured medical findings into interactive **Mermaid.js** dependency graphs for better understanding.

---

### 📊 AI Presentation Generator

Generate a presentation summarizing the uploaded paper, with the option of converting the slides into a .PPTX file.

---

# ✨ Architectural Highlights

## 🔍 Domain Verification
The application automatically rejects non-medical PDFs using LLM-based classification, ensuring that only domain-specific research papers are accepted.

---

## 🧮 Custom Vector Search Engine

Instead of relying on external vector databases, MedAgent-X implements an in-memory semantic retrieval engine using NumPy.
MedAgent-X includes a defensive extraction pipeline using extensive exception handling that gracefully skips problematic pages without interrupting document processing.

---

## 📑 Structured LLM Output

Rather than accepting free-form AI responses, MedAgent-X prompts the LLM to generate structured JSON.
This predictable schema is directly mapped into PowerPoint templates using **python-pptx**, enabling reliable presentation generation.

---

## ⚙ Stateless Backend Design

- Frontend hosted on **Vercel**
- Backend deployed on **Render**
- Communication exclusively through REST APIs
- No Google Cloud SDK dependencies
- Raw Gemini REST implementation for lightweight deployment

---

# 🛠 Tech Stack

## Frontend

- Vanilla JavaScript
- Tailwind CSS
- PDF.js
- Mermaid.js

---

## Backend

- Python
- FastAPI
- Uvicorn
- NumPy
- PyPDF
- python-pptx

---

## AI

- Google Gemini 2.5 Flash API
- Retrieval-Augmented Generation (RAG)
- Custom Semantic Search
- Prompt Engineering

---

## Deployment

- Vercel (Frontend)
- Render (Backend)

---
