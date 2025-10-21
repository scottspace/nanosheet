#!/bin/bash
set -e

echo "========================================="
echo "Nanosheet GCP Setup Script"
echo "========================================="
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found"
    exit 1
fi

# Extract project ID from service account key
PROJECT_ID=$(cat "$GOOGLE_APPLICATION_CREDENTIALS" | python3 -c "import sys, json; print(json.load(sys.stdin)['project_id'])")
SERVICE_ACCOUNT_EMAIL=$(cat "$GOOGLE_APPLICATION_CREDENTIALS" | python3 -c "import sys, json; print(json.load(sys.stdin)['client_email'])")

echo "Project ID: $PROJECT_ID"
echo "Service Account: $SERVICE_ACCOUNT_EMAIL"
echo "GCS Bucket: $YJS_GCS_BUCKET"
echo ""

# Set the active project
echo "Setting active project..."
gcloud config set project "$PROJECT_ID"
echo ""

# Enable required APIs
echo "Enabling required Google Cloud APIs..."
echo "- Cloud Storage API"
gcloud services enable storage.googleapis.com

echo "- Cloud Datastore API"
gcloud services enable datastore.googleapis.com

echo "- Cloud Firestore API (for Datastore mode)"
gcloud services enable firestore.googleapis.com
echo ""

# Check Datastore mode
echo "Checking Datastore/Firestore mode..."
DATASTORE_MODE=$(gcloud firestore databases list --format="value(type)" 2>/dev/null || echo "NONE")

if [ "$DATASTORE_MODE" = "NONE" ]; then
    echo ""
    echo "⚠️  No Datastore/Firestore database found!"
    echo "You need to create a Datastore mode database."
    echo ""
    echo "Creating Datastore mode database in us-central1..."
    gcloud firestore databases create --type=datastore-mode --location=us-central1
    echo "✅ Datastore database created"
elif [ "$DATASTORE_MODE" = "DATASTORE_MODE" ]; then
    echo "✅ Datastore mode is already configured"
elif [ "$DATASTORE_MODE" = "FIRESTORE_NATIVE" ]; then
    echo "❌ ERROR: Project is using Firestore Native mode, not Datastore mode"
    echo "   Nanosheet requires Datastore mode. You cannot convert between modes."
    echo "   Please use a different project or create the database in Datastore mode."
    exit 1
else
    echo "✅ Database type: $DATASTORE_MODE"
fi
echo ""

# Grant IAM permissions to service account
echo "Granting IAM permissions to service account..."

echo "- Storage Admin (for GCS buckets)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/storage.admin" \
    --condition=None \
    --quiet

echo "- Datastore User (for Datastore read/write)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/datastore.user" \
    --condition=None \
    --quiet

echo ""

# Verify/Create GCS bucket
echo "Checking GCS bucket: gs://$YJS_GCS_BUCKET"
if gsutil ls "gs://$YJS_GCS_BUCKET" >/dev/null 2>&1; then
    echo "✅ Bucket already exists"
else
    echo "Creating bucket gs://$YJS_GCS_BUCKET..."
    if gsutil mb -p "$PROJECT_ID" -l us-central1 "gs://$YJS_GCS_BUCKET"; then
        echo "✅ Bucket created successfully"

        # Set uniform bucket-level access (recommended for apps)
        gsutil uniformbucketlevelaccess set on "gs://$YJS_GCS_BUCKET"
        echo "✅ Enabled uniform bucket-level access"
    else
        echo "❌ Failed to create bucket"
        exit 1
    fi
fi
echo ""

# Test permissions
echo "Testing permissions..."

# Test GCS write
TEST_FILE=$(mktemp)
echo "test" > "$TEST_FILE"
if gsutil cp "$TEST_FILE" "gs://$YJS_GCS_BUCKET/test.txt" >/dev/null 2>&1; then
    echo "✅ GCS write permission: OK"
    gsutil rm "gs://$YJS_GCS_BUCKET/test.txt" >/dev/null 2>&1
else
    echo "❌ GCS write permission: FAILED"
fi
rm "$TEST_FILE"

# Test Datastore access (via Python)
echo "Testing Datastore access..."
python3 -c "
import os
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '$GOOGLE_APPLICATION_CREDENTIALS'
from google.cloud import datastore
try:
    client = datastore.Client(project='$PROJECT_ID')
    # Try a simple query
    query = client.query(kind='Card')
    list(query.fetch(limit=1))
    print('✅ Datastore access: OK')
except Exception as e:
    print(f'❌ Datastore access: FAILED - {e}')
"
echo ""

echo "========================================="
echo "✅ GCP Setup Complete!"
echo "========================================="
echo ""
echo "Summary:"
echo "  - APIs enabled: storage, datastore, firestore"
echo "  - Service account permissions: storage.admin, datastore.user"
echo "  - Bucket: gs://$YJS_GCS_BUCKET"
echo ""
echo "You can now run:"
echo "  ./start-backend.sh"
echo ""
