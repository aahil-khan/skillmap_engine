# GitHub Actions Deployment Setup Guide (Self-Hosted Runner)

This guide will help you set up automatic deployment for your SkillMap Engine using GitHub Actions with a self-hosted runner.

## Prerequisites

1. Your code must be in a GitHub repository
2. Self-hosted GitHub Actions runner configured and running
3. Your server must have Git, Docker, and Docker Compose installed

## Step 1: Self-Hosted Runner Setup ✅

Since you're using a self-hosted runner, you've already completed this step! Your runner is configured and running on your server.

**No GitHub Secrets Required!** 🎉
- The runner already has access to your server
- No SSH configuration needed
- No HOST, USERNAME, or SSH_PRIVATE_KEY secrets required

## Step 2: Prepare Your Server ✅

Since you're using a self-hosted runner, your server should already be prepared! But make sure you have:

```bash
# Verify Docker installation
docker --version
docker-compose --version

# Verify your user can run Docker without sudo
docker ps

# Make sure your .env file exists with all required environment variables
ls -la .env
```

## Step 3: Deploy! 🚀

Your setup is much simpler with a self-hosted runner:

1. Push changes to the main branch:
   ```bash
   git add .
   git commit -m "Set up GitHub Actions deployment"
   git push origin main
   ```

2. Go to your GitHub repository → Actions tab to watch the deployment

3. The workflow will:
   - Run tests (if any)
   - Deploy directly on your server (no SSH needed!)
   - Rebuild and restart Docker containers
   - Run health checks
   - Show deployment status

## Workflow Features

- ✅ **Automatic testing** before deployment
- ✅ **Environment preservation** (your .env file is backed up and restored)
- ✅ **Graceful container shutdown** with timeout
- ✅ **Docker cleanup** to free up space
- ✅ **Health checks** to ensure successful deployment
- ✅ **Detailed logging** for troubleshooting
- ✅ **Rollback safety** (old containers are stopped gracefully)

## Troubleshooting

### Common Issues:

1. **SSH Connection Failed**
   - Check HOST, USERNAME, and SSH_PRIVATE_KEY secrets
   - Ensure your public key is in the server's authorized_keys
   - Check if the server is accessible from GitHub's IP ranges

2. **Docker Permission Denied**
   - Add your user to the docker group: `sudo usermod -aG docker $USER`
   - Log out and log back in

3. **Health Check Failed**
   - Check if port 5005 is accessible
   - Review container logs for errors
   - Ensure all environment variables are properly set

4. **Git Pull Failed**
   - Ensure the repository is properly cloned on the server
   - Check if there are uncommitted changes on the server

### Debug Commands:

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs

# Check if port is accessible
curl http://localhost:5005/health

# Check Docker daemon
sudo systemctl status docker
```

## Security Best Practices

1. **Use SSH keys instead of passwords**
2. **Limit SSH access to specific IP ranges if possible**
3. **Regularly rotate SSH keys**
4. **Keep your server and Docker updated**
5. **Use non-root user for deployment**
6. **Monitor deployment logs for suspicious activity**

## Next Steps

After successful setup, you can:
- Add more environments (staging, production)
- Set up monitoring and alerting
- Add database migrations to the workflow
- Configure automatic rollbacks on failure
- Add Slack/Discord notifications for deployment status
