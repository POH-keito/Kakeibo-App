#!/bin/bash
set -e

# Configuration
PROJECT_ID="kakeibo-app-fksm"
REGION="asia-northeast1"
SERVICE_NAME="kakeibo-app"
REPO_NAME="kakeibo"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Kakeibo App Initial Deployment ===${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    exit 1
fi

# Check if logged in
if ! gcloud auth print-identity-token &> /dev/null; then
    echo -e "${YELLOW}Please login to gcloud:${NC}"
    gcloud auth login
fi

# Set project
echo -e "${GREEN}Setting project to ${PROJECT_ID}...${NC}"
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo -e "${GREEN}Enabling required APIs...${NC}"
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    iap.googleapis.com

# Create Artifact Registry repository if it doesn't exist
echo -e "${GREEN}Creating Artifact Registry repository...${NC}"
gcloud artifacts repositories create ${REPO_NAME} \
    --repository-format=docker \
    --location=${REGION} \
    --description="Kakeibo App Docker images" \
    2>/dev/null || echo "Repository already exists"

# Configure Docker to use Artifact Registry
echo -e "${GREEN}Configuring Docker authentication...${NC}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

# Build and push using Cloud Build
IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"

echo -e "${GREEN}Building and pushing image with Cloud Build...${NC}"
gcloud builds submit --tag ${IMAGE_URL} .

# Load environment variables from .env.local
echo -e "${GREEN}Loading environment variables from .env.local...${NC}"
if [ -f .env.local ]; then
    # Read .env.local and format as Cloud Run env vars
    ENV_VARS=""
    while IFS='=' read -r key value || [ -n "$key" ]; do
        # Skip empty lines and comments
        [[ -z "$key" || "$key" =~ ^# ]] && continue
        # Remove quotes from value
        value=$(echo "$value" | sed 's/^["'"'"']//;s/["'"'"']$//')
        if [ -n "$ENV_VARS" ]; then
            ENV_VARS="${ENV_VARS},${key}=${value}"
        else
            ENV_VARS="${key}=${value}"
        fi
    done < .env.local
else
    echo -e "${RED}Error: .env.local not found${NC}"
    exit 1
fi

# Deploy to Cloud Run
echo -e "${GREEN}Deploying to Cloud Run...${NC}"
gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE_URL} \
    --platform managed \
    --region ${REGION} \
    --allow-unauthenticated \
    --set-env-vars "${ENV_VARS}" \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --port 8080

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo -e "Service URL: ${YELLOW}${SERVICE_URL}${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Go to GCP Console > Cloud Run > ${SERVICE_NAME}"
echo "2. Set up continuous deployment from GitHub"
echo "3. Configure IAP if needed for authentication"
