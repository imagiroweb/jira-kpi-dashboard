#!/bin/bash
set -e

# =============================================================================
# Script de déploiement AWS pour JIRA KPI Dashboard
# =============================================================================

# Configuration - À modifier selon votre environnement
AWS_REGION="${AWS_REGION:-eu-west-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID}"
EC2_HOST="${EC2_HOST}"
EC2_USER="${EC2_USER:-ec2-user}"
SSH_KEY="${SSH_KEY:-~/.ssh/aws-key.pem}"

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Vérification des variables requises
check_requirements() {
    log_info "Vérification des prérequis..."
    
    if [ -z "$AWS_ACCOUNT_ID" ]; then
        log_error "AWS_ACCOUNT_ID non défini. Export: export AWS_ACCOUNT_ID=123456789012"
        exit 1
    fi
    
    if [ -z "$EC2_HOST" ]; then
        log_error "EC2_HOST non défini. Export: export EC2_HOST=ec2-xx-xx-xx-xx.compute.amazonaws.com"
        exit 1
    fi
    
    command -v aws >/dev/null 2>&1 || { log_error "AWS CLI non installé"; exit 1; }
    command -v docker >/dev/null 2>&1 || { log_error "Docker non installé"; exit 1; }
}

# Login ECR
ecr_login() {
    log_info "Connexion à Amazon ECR..."
    aws ecr get-login-password --region $AWS_REGION | \
        docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
}

# Build et push des images
build_and_push() {
    log_info "Build des images Docker..."
    
    ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    
    # Backend
    log_info "Build du backend..."
    docker build -t jira-kpi-backend ./backend
    docker tag jira-kpi-backend:latest ${ECR_URI}/jira-kpi-backend:latest
    docker push ${ECR_URI}/jira-kpi-backend:latest
    
    # Frontend
    log_info "Build du frontend..."
    docker build -t jira-kpi-frontend ./frontend
    docker tag jira-kpi-frontend:latest ${ECR_URI}/jira-kpi-frontend:latest
    docker push ${ECR_URI}/jira-kpi-frontend:latest
    
    log_info "Images poussées avec succès sur ECR"
}

# Déploiement sur EC2
deploy_to_ec2() {
    log_info "Déploiement sur EC2..."
    
    # Copier les fichiers nécessaires
    log_info "Copie des fichiers de configuration..."
    scp -i $SSH_KEY docker-compose.prod.yml ${EC2_USER}@${EC2_HOST}:~/jira-kpi/docker-compose.yml
    scp -i $SSH_KEY .env.prod ${EC2_USER}@${EC2_HOST}:~/jira-kpi/.env
    
    # Déployer sur EC2
    log_info "Lancement des conteneurs..."
    ssh -i $SSH_KEY ${EC2_USER}@${EC2_HOST} << 'ENDSSH'
        cd ~/jira-kpi
        
        # Login ECR sur l'instance EC2
        aws ecr get-login-password --region ${AWS_REGION} | \
            docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
        
        # Pull des nouvelles images
        docker-compose pull
        
        # Arrêt et redémarrage des conteneurs
        docker-compose down
        docker-compose up -d
        
        # Nettoyage des anciennes images
        docker image prune -f
        
        echo "Déploiement terminé !"
ENDSSH
    
    log_info "Déploiement terminé avec succès !"
    log_info "Application accessible sur: http://${EC2_HOST}"
}

# Menu principal
case "${1:-all}" in
    login)
        check_requirements
        ecr_login
        ;;
    build)
        check_requirements
        ecr_login
        build_and_push
        ;;
    deploy)
        deploy_to_ec2
        ;;
    all)
        check_requirements
        ecr_login
        build_and_push
        deploy_to_ec2
        ;;
    *)
        echo "Usage: $0 {login|build|deploy|all}"
        echo ""
        echo "  login  - Se connecter à ECR"
        echo "  build  - Build et push des images vers ECR"
        echo "  deploy - Déployer sur EC2"
        echo "  all    - Exécuter toutes les étapes"
        exit 1
        ;;
esac
