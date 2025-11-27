# Usa imagem leve do Node
FROM node:20-alpine

# Diretório de trabalho
WORKDIR /app

# Copia dependências
COPY package*.json ./

# Limpa cache e instala dependências (incluindo as de dev para o build)
RUN npm cache clean --force && npm install

# Copia código fonte
COPY . .

# Argumento para API Key
ARG API_KEY
ENV API_KEY=$API_KEY

# Build do React
RUN npm run build

# Porta
EXPOSE 3001

# Iniciar
CMD ["npm", "start"]
