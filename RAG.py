import os
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_community.vectorstores import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Yahan hum professional business/tech data daalenge (Sewer clown allowed nahi hai!)
professional_knowledge = """
Swapify Platform Overview: Swapify is a peer-to-peer item exchange ecosystem designed for secure and efficient asset trading.
User Authentication: Secure JWT-based authentication ensures user data privacy and encrypted transaction logs.
Database Architecture: Utilizes distributed cloud databases with automated backups to maintain zero data loss and low latency.
API Integration: RESTful APIs connect the front-end interface seamlessly with the inventory matching engine.
"""

# Text ko chunks mein todna
text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
docs = text_splitter.create_documents([professional_knowledge])

# Embeddings model setup
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# ChromaDB mein secure memory banana
vector_store = Chroma.from_documents(docs, embeddings, persist_directory="./project_memory")
retriever = vector_store.as_retriever(search_kwargs={"k": 3})

# Professional System Prompt
system_prompt = (
    "You are a professional technical assistant.\n"
    "Use the provided context to answer the user's technical questions accurately and concisely.\n\n"
    "{context}"
)

prompt = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    ("human", "{input}"),
])

print("Professional RAG System initialized successfully! Teacher ko dikhane ke liye ekdam ready hai. 🚀")