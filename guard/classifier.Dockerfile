# The guard's trained classifier, see classifier.py and the README.
# TEI cannot serve these models: it runs no DeBERTa.
FROM python:3.12-slim
RUN pip install --no-cache-dir torch==2.7.0 --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir transformers==4.51.3 sentencepiece==0.2.0 protobuf==5.29.4
COPY classifier.py /app/
# The model is fetched at the first start, into the volume compose mounts here.
ENV HF_HOME=/models
EXPOSE 8000
CMD ["python", "/app/classifier.py"]
