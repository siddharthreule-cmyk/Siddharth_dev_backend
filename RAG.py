from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_community.vectorstores import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

# 1. Yeh tera base data ya documents hai (Yahan Swapify ya koi bhi info daal sakte ho)
knowledge_base = """
Swapify Platform: A peer-to-peer item exchange ecosystem.
Authentication: Uses secure tokens for user privacy.
Support: Users can trade items, chat safely, and manage inventory.
"""

# 2. Text ko chunks mein todna
text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
docs = text_splitter.create_documents([knowledge_base])

# 3. Embeddings aur Vector Database (Yeh AI ki long-term memory banega)
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
vector_store = Chroma.from_documents(docs, embeddings, persist_directory="./swapify_memory")

# 4. Retriever banana (Jo database se data dhoond kar layega)
retriever = vector_store.as_retriever(search_kwargs={"k": 2})

# 5. Yahan hum AI ko proper instruction de rahe hain ki database ka data kaise use karna hai
system_prompt = (
    "You are a helpful assistant for Swapify.\n"
    "Use the retrieved context below to answer the user's question accurately.\n"
    "If you don't know the answer based on the context, just say you don't know.\n\n"
    "Context:\n{context}"
)

prompt = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    ("human", "{input}"),
])

# --- SIMULATING THE CHAT CONNECTION (Jaise frontend se request aati hai) ---
print("--- Swapify AI System Linked & Ready! ---")

# Maan le user ne ye sawaal pucha:
user_query = "How does Swapify handle user privacy?"

# STEP-BY-STEP LINKING (The Backend Logic):
# 1. Retriever database se relevant text nikalega
retrieved_docs = retriever.invoke(user_query)

# 2. Hum check karte hain ki kya mila
print(f"\n[Backend Log] Retrieved data from DB: {len(retrieved_docs)} chunks found.")

# Note: Asli LLM (jaise OpenAI ya HuggingFace model) ke sath yahan LLM chain execute hoti hai. 
# Yeh code tujhe dikhata hai ki RAG aur AI aapas mein judte kaise hain!