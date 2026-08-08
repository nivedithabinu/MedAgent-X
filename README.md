# 🩺 MedAgent-X

> **An AI-powered medical research assistant for understanding clinical documents**

MedAgent-X is a full-stack AI application that helps users understand and explore medical research papers more efficiently.

Users can upload a clinical PDF, ask questions about its content, and use AI to generate summaries, visual knowledge graphs, and presentation slides. The application uses a **Retrieval-Augmented Generation (RAG)** approach to retrieve relevant information from the uploaded document before generating responses.

---

## 🚀 Features

### 📄 PDF Document Analysis

- Upload medical and clinical research papers in PDF format.
- Automatically extract text from uploaded documents.
- Process documents into smaller sections for efficient information retrieval.
- Validate uploaded documents to ensure they are relevant to the medical domain.

### 🤖 AI Research Chat

- Ask questions directly about an uploaded research paper.
- Retrieve relevant sections of the document before generating an answer.
- Responses are grounded in the uploaded document.
- Includes **page references** to help users locate the information in the original paper.

### 🧠 Knowledge Graph

- Generate an interactive **Mermaid.js mind map** from the uploaded document.
- Organizes important concepts, symptoms, diagnoses, treatments, and other relationships.
- Helps users understand complex medical information visually.

### 📊 Presentation Generator

- Automatically generate presentation slides from a research paper.
- Converts important findings and concepts into concise slide content.
- Export the generated presentation as a **PowerPoint (.pptx)** file.

---

## 🛠️ Tech Stack

### 🎨 Frontend

The frontend provides the interactive interface for uploading documents, viewing PDFs, chatting with the AI, exploring generated graphs, and creating presentations.

- **HTML**
- **CSS**
- **JavaScript** - Frontend logic and API integration
- **PDF.js** - PDF rendering and page navigation
- **Mermaid.js** - Interactive knowledge graph visualization

---

### ⚙️ Backend

The backend handles document processing, API requests, semantic retrieval, and AI-powered operations.

- **Python** - Core backend language
- **FastAPI** - REST API and backend services
- **NumPy** - Embeddings and custom similarity search
- **PyPDF** - PDF text extraction
- **python-pptx** - PowerPoint presentation generation

---

### 🤖 AI & RAG

The AI pipeline processes uploaded documents and retrieves relevant information before generating responses.

- **Google Gemini** - AI-powered content generation
- **Retrieval-Augmented Generation (RAG)** - Document-grounded question answering
- **Embeddings** - Represent document content for semantic retrieval
- **Semantic Search** - Finds relevant sections of uploaded documents
- **Prompt Engineering** - Structures context and AI responses

---

### ☁️ Deployment

- **Vercel** - Frontend
- **Render** - Backend
- **REST APIs** - Communication between frontend and backend
