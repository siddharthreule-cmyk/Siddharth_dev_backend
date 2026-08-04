import os
import sys
from dotenv import load_dotenv
from langchain_community.vectorstores import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings

# Local .env file load karo
load_dotenv()

# Custom variable se API key fetch karna
swapify_key = os.getenv("SWAPIFY_LLM_API_KEY")

if not swapify_key:
  print(
      "Error: SWAPIFY_LLM_API_KEY not found in environment variables!",
      file=sys.stderr,
  )
  sys.exit(1)

# Groq LLM initialize with custom API key variable
llm = ChatGroq(model="llama3-70b-8192", temperature=0.3, api_key=swapify_key)

# Vector DB aur Retriever load karna
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
vector_store = Chroma(
    persist_directory="./swapify_memory", embedding_function=embeddings
)
retriever = vector_store.as_retriever(search_kwargs={"k": 2})

# Prompt Template
prompt = ChatPromptTemplate.from_template("""
Answer the user's question accurately using only the provided context below.
If you don't know the answer, just say you don't know.

Context:
{context}

Question: {input}
""")


def get_rag_response(query):
  docs = retriever.invoke(query)
  context_text = "\n".join([doc.page_content for doc in docs])

  formatted_prompt = prompt.format(context=context_text, input=query)
  response = llm.invoke(formatted_prompt)

  return response.content


if __name__ == "__main__":
  user_query = sys.argv[1] if len(sys.argv) > 1 else "Hello"
  print(get_rag_response(user_query))