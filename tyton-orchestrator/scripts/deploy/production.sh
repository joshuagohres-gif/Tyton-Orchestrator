#!/bin/bash

# Tyton Orchestrator Production Deployment Script
# This script handles the complete production deployment process

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NAMESPACE="production"
CLUSTER_NAME="tyton-production-cluster"
AWS_REGION="us-west-2"
IMAGE_REGISTRY="ghcr.io"
IMAGE_NAME="your-org/tyton-orchestrator"

# Default values
DRY_RUN=${DRY_RUN:-false}
FORCE_DEPLOY=${FORCE_DEPLOY:-false}
SKIP_TESTS=${SKIP_TESTS:-false}
SKIP_BACKUP=${SKIP_BACKUP:-false}
IMAGE_TAG=${IMAGE_TAG:-"latest"}

# Functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

confirm() {
    if [[ "$FORCE_DEPLOY" == "true" ]]; then
        return 0
    fi
    
    read -p "$(echo -e "${YELLOW}$1 (y/N): ${NC}")" -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check required commands
    local required_commands=("kubectl" "aws" "docker" "jq" "envsubst")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            error "Required command '$cmd' not found"
            exit 1
        fi
    done
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        error "AWS credentials not configured or expired"
        exit 1
    fi
    
    # Check kubectl context
    if ! kubectl config current-context | grep -q "$CLUSTER_NAME"; then
        warning "kubectl context is not set to $CLUSTER_NAME"
        if confirm "Update kubectl context?"; then
            aws eks update-kubeconfig --region "$AWS_REGION" --name "$CLUSTER_NAME"
        else
            exit 1
        fi
    fi
    
    # Check namespace exists
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        error "Namespace '$NAMESPACE' does not exist"
        exit 1
    fi
    
    success "Prerequisites check passed"
}

validate_image() {
    log "Validating Docker image: $IMAGE_REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
    
    if ! docker manifest inspect "$IMAGE_REGISTRY/$IMAGE_NAME:$IMAGE_TAG" &> /dev/null; then
        error "Docker image not found or not accessible"
        exit 1
    fi
    
    success "Docker image validation passed"
}

run_pre_deployment_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        warning "Skipping pre-deployment tests"
        return 0
    fi
    
    log "Running pre-deployment tests..."
    
    cd "$PROJECT_ROOT"
    
    # Run critical tests
    if ! npm run test:critical; then
        error "Critical tests failed"
        exit 1
    fi
    
    success "Pre-deployment tests passed"
}

create_backup() {
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        warning "Skipping database backup"
        return 0
    fi
    
    log "Creating database backup..."
    
    local backup_name="pre-deploy-$(date +%Y%m%d%H%M%S)"
    
    if kubectl create job "$backup_name" --from=cronjob/db-backup -n "$NAMESPACE"; then
        log "Waiting for backup to complete..."
        kubectl wait --for=condition=complete job/"$backup_name" -n "$NAMESPACE" --timeout=600s
        success "Database backup created: $backup_name"
    else
        error "Failed to create database backup"
        exit 1
    fi
}

run_database_migrations() {
    log "Running database migrations..."
    
    cd "$PROJECT_ROOT"
    
    # Set production database URL
    export DATABASE_URL=$(kubectl get secret tyton-secrets -n "$NAMESPACE" -o jsonpath="{.data.database-url}" | base64 -d)
    
    if npm run db:migrate:prod; then
        success "Database migrations completed"
    else
        error "Database migrations failed"
        exit 1
    fi
}

deploy_application() {
    log "Deploying application to production..."
    
    cd "$PROJECT_ROOT"
    
    # Export environment variables for envsubst
    export IMAGE_TAG
    export DATABASE_URL=$(kubectl get secret tyton-secrets -n "$NAMESPACE" -o jsonpath="{.data.database-url}" | base64 -d)
    export REDIS_URL=$(kubectl get secret tyton-secrets -n "$NAMESPACE" -o jsonpath="{.data.redis-url}" | base64 -d)
    export JWT_SECRET=$(kubectl get secret tyton-secrets -n "$NAMESPACE" -o jsonpath="{.data.jwt-secret}" | base64 -d)
    export OPENAI_API_KEY=$(kubectl get secret tyton-secrets -n "$NAMESPACE" -o jsonpath="{.data.openai-api-key}" | base64 -d)
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN: Would deploy with the following configuration:"
        envsubst < k8s/production/deployment.yaml
        return 0
    fi
    
    # Apply Kubernetes manifests
    envsubst < k8s/production/deployment.yaml | kubectl apply -f -
    
    # Wait for rollout to complete
    log "Waiting for deployment rollout..."
    if kubectl rollout status deployment/tyton-orchestrator -n "$NAMESPACE" --timeout=900s; then
        success "Deployment rollout completed"
    else
        error "Deployment rollout failed"
        exit 1
    fi
}

run_health_checks() {
    log "Running health checks..."
    
    local max_attempts=12
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        log "Health check attempt $attempt/$max_attempts"
        
        if kubectl run health-check-$(date +%s) \
            --image=curlimages/curl:latest \
            --rm -i --restart=Never \
            --timeout=30s \
            -- curl -f "http://tyton-orchestrator.$NAMESPACE.svc.cluster.local:3000/api/health/comprehensive" &> /dev/null; then
            success "Health checks passed"
            return 0
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            error "Health checks failed after $max_attempts attempts"
            exit 1
        fi
        
        sleep 30
        ((attempt++))
    done
}

run_smoke_tests() {
    log "Running smoke tests..."
    
    cd "$PROJECT_ROOT"
    
    # Set test target to production URL
    export TEST_BASE_URL="https://tyton-orchestrator.example.com"
    
    if npm run test:smoke; then
        success "Smoke tests passed"
    else
        error "Smoke tests failed"
        exit 1
    fi
}

monitor_deployment() {
    log "Monitoring deployment for 5 minutes..."
    
    local end_time=$(($(date +%s) + 300)) # 5 minutes
    local check_interval=30
    
    while [[ $(date +%s) -lt $end_time ]]; do
        # Check pod status
        local unhealthy_pods=$(kubectl get pods -n "$NAMESPACE" -l app=tyton-orchestrator --no-headers | grep -v "Running\|Completed" | wc -l)
        if [[ $unhealthy_pods -gt 0 ]]; then
            warning "Found $unhealthy_pods unhealthy pods"
        fi
        
        # Check error rates via metrics endpoint
        if kubectl run metrics-check-$(date +%s) \
            --image=curlimages/curl:latest \
            --rm -i --restart=Never \
            --timeout=10s \
            -- curl -s "http://tyton-orchestrator.$NAMESPACE.svc.cluster.local:3000/api/admin/health/dashboard" | \
            jq -e '.api.metrics.errorRate | tonumber < 5' &> /dev/null; then
            log "Error rate within acceptable range"
        else
            warning "High error rate detected"
        fi
        
        sleep $check_interval
    done
    
    success "Deployment monitoring completed"
}

rollback_deployment() {
    error "Rolling back deployment..."
    
    kubectl rollout undo deployment/tyton-orchestrator -n "$NAMESPACE"
    kubectl rollout status deployment/tyton-orchestrator -n "$NAMESPACE" --timeout=600s
    
    warning "Deployment rolled back to previous version"
}

cleanup() {
    log "Cleaning up temporary resources..."
    
    # Clean up any temporary jobs or pods
    kubectl delete jobs -n "$NAMESPACE" -l created-by=deployment-script --ignore-not-found=true
    
    log "Cleanup completed"
}

show_deployment_info() {
    success "Deployment completed successfully!"
    echo
    echo "=== Deployment Summary ==="
    echo "Namespace: $NAMESPACE"
    echo "Image: $IMAGE_REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
    echo "Replicas: $(kubectl get deployment tyton-orchestrator -n "$NAMESPACE" -o jsonpath='{.status.replicas}')"
    echo "Ready Replicas: $(kubectl get deployment tyton-orchestrator -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')"
    echo "URL: https://tyton-orchestrator.example.com"
    echo
    echo "=== Next Steps ==="
    echo "1. Monitor the application logs: kubectl logs -f deployment/tyton-orchestrator -n $NAMESPACE"
    echo "2. Check metrics dashboard: https://tyton-orchestrator.example.com/api/admin/health/dashboard"
    echo "3. Review monitoring alerts for the next 24 hours"
    echo
}

# Main execution
main() {
    log "Starting Tyton Orchestrator production deployment"
    log "Image: $IMAGE_REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
    log "Namespace: $NAMESPACE"
    log "Dry run: $DRY_RUN"
    
    if ! confirm "Proceed with production deployment?"; then
        log "Deployment cancelled by user"
        exit 0
    fi
    
    # Set up error handling
    trap 'error "Deployment failed at line $LINENO"; rollback_deployment; cleanup; exit 1' ERR
    trap 'cleanup' EXIT
    
    # Execute deployment steps
    check_prerequisites
    validate_image
    run_pre_deployment_tests
    create_backup
    run_database_migrations
    deploy_application
    run_health_checks
    run_smoke_tests
    monitor_deployment
    show_deployment_info
    
    success "Production deployment completed successfully!"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE_DEPLOY=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --image-tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dry-run           Show what would be deployed without actually deploying"
            echo "  --force             Skip confirmation prompts"
            echo "  --skip-tests        Skip pre-deployment tests"
            echo "  --skip-backup       Skip database backup"
            echo "  --image-tag TAG     Specify image tag to deploy (default: latest)"
            echo "  --help              Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  DRY_RUN=true        Enable dry run mode"
            echo "  FORCE_DEPLOY=true   Skip confirmation prompts"
            echo "  SKIP_TESTS=true     Skip pre-deployment tests"
            echo "  SKIP_BACKUP=true    Skip database backup"
            echo "  IMAGE_TAG=tag       Specify image tag"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main function
main