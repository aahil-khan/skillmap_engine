#!/bin/bash

# SkillMap Engine Deployment Readiness Check
# This script checks if your environment is ready for GitHub Actions deployment

echo "🚀 SkillMap Engine Deployment Readiness Check"
echo "=============================================="
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_docker() {
    echo -n "Checking Docker installation... "
    if command -v docker &> /dev/null; then
        echo -e "${GREEN}✓${NC}"
        docker --version
    else
        echo -e "${RED}✗${NC}"
        echo "  Docker is not installed or not in PATH"
        return 1
    fi
}

check_docker_compose() {
    echo -n "Checking Docker Compose installation... "
    if command -v docker-compose &> /dev/null; then
        echo -e "${GREEN}✓${NC}"
        docker-compose --version
    else
        echo -e "${RED}✗${NC}"
        echo "  Docker Compose is not installed or not in PATH"
        return 1
    fi
}

check_docker_permissions() {
    echo -n "Checking Docker permissions... "
    if docker ps &> /dev/null; then
        echo -e "${GREEN}✓${NC}"
        echo "  User can run Docker without sudo"
    else
        echo -e "${RED}✗${NC}"
        echo "  User cannot run Docker without sudo"
        echo "  Run: sudo usermod -aG docker \$USER && newgrp docker"
        return 1
    fi
}

check_env_file() {
    echo -n "Checking .env file... "
    if [ -f ".env" ]; then
        echo -e "${GREEN}✓${NC}"
        echo "  .env file exists"
        
        # Check for required variables
        required_vars=("OPENAI_API_KEY" "QDRANT_URL" "QDRANT_API_KEY" "SUPABASE_URL" "SUPABASE_ANON_KEY")
        missing_vars=()
        
        for var in "${required_vars[@]}"; do
            if ! grep -q "^${var}=" .env; then
                missing_vars+=("$var")
            fi
        done
        
        if [ ${#missing_vars[@]} -eq 0 ]; then
            echo "  All required environment variables are present"
        else
            echo -e "  ${YELLOW}Warning:${NC} Missing variables: ${missing_vars[*]}"
        fi
    else
        echo -e "${RED}✗${NC}"
        echo "  .env file not found"
        return 1
    fi
}

check_git_repo() {
    echo -n "Checking Git repository... "
    if [ -d ".git" ]; then
        echo -e "${GREEN}✓${NC}"
        
        # Check if origin is set
        if git remote get-url origin &> /dev/null; then
            origin_url=$(git remote get-url origin)
            echo "  Origin: $origin_url"
            
            # Check if it's a GitHub repository
            if [[ $origin_url == *"github.com"* ]]; then
                echo "  GitHub repository detected"
            else
                echo -e "  ${YELLOW}Warning:${NC} Not a GitHub repository"
            fi
        else
            echo -e "  ${YELLOW}Warning:${NC} No origin remote set"
        fi
    else
        echo -e "${RED}✗${NC}"
        echo "  Not a Git repository"
        return 1
    fi
}

check_github_workflow() {
    echo -n "Checking GitHub Actions workflow... "
    if [ -f ".github/workflows/deploy.yml" ]; then
        echo -e "${GREEN}✓${NC}"
        echo "  GitHub Actions workflow file exists"
    else
        echo -e "${RED}✗${NC}"
        echo "  GitHub Actions workflow file not found"
        return 1
    fi
}

check_ssh_key() {
    echo -n "Checking SSH key... "
    if [ -f "$HOME/.ssh/id_rsa" ]; then
        echo -e "${GREEN}✓${NC}"
        echo "  SSH private key found at $HOME/.ssh/id_rsa"
        
        if [ -f "$HOME/.ssh/id_rsa.pub" ]; then
            echo "  SSH public key found at $HOME/.ssh/id_rsa.pub"
            echo "  Public key fingerprint:"
            ssh-keygen -lf "$HOME/.ssh/id_rsa.pub"
        else
            echo -e "  ${YELLOW}Warning:${NC} Public key not found"
        fi
    else
        echo -e "${YELLOW}⚠${NC}"
        echo "  SSH key not found. Generate one with:"
        echo "  ssh-keygen -t rsa -b 4096 -C \"your-email@example.com\""
    fi
}

check_current_deployment() {
    echo -n "Checking current deployment... "
    if docker-compose ps | grep -q "Up"; then
        echo -e "${GREEN}✓${NC}"
        echo "  Containers are currently running"
        docker-compose ps
    else
        echo -e "${YELLOW}⚠${NC}"
        echo "  No containers currently running"
    fi
}

check_port_availability() {
    echo -n "Checking port 5005 availability... "
    if curl -s http://localhost:5005/health &> /dev/null; then
        echo -e "${GREEN}✓${NC}"
        echo "  Port 5005 is accessible and health endpoint responds"
    else
        echo -e "${YELLOW}⚠${NC}"
        echo "  Port 5005 is not accessible or health endpoint not responding"
    fi
}

# Main execution
echo "Running checks..."
echo

checks_passed=0
total_checks=0

run_check() {
    ((total_checks++))
    if $1; then
        ((checks_passed++))
    fi
    echo
}

run_check check_docker
run_check check_docker_compose
run_check check_docker_permissions
run_check check_env_file
run_check check_git_repo
run_check check_github_workflow
run_check check_ssh_key
run_check check_current_deployment
run_check check_port_availability

echo "=============================================="
echo "Summary: $checks_passed/$total_checks checks passed"

if [ $checks_passed -eq $total_checks ]; then
    echo -e "${GREEN}🎉 Your environment is ready for GitHub Actions deployment!${NC}"
    echo
    echo "Next steps:"
    echo "1. Set up GitHub repository secrets (see DEPLOYMENT.md)"
    echo "2. Push to main branch to trigger deployment"
    echo "3. Monitor the deployment in GitHub Actions tab"
elif [ $checks_passed -ge $((total_checks - 2)) ]; then
    echo -e "${YELLOW}⚠ Your environment is mostly ready. Fix the warnings above.${NC}"
else
    echo -e "${RED}❌ Your environment needs some fixes before deployment.${NC}"
    echo "Please address the failed checks above."
fi

echo
echo "For detailed setup instructions, see DEPLOYMENT.md"
