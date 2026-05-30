param(
    [Parameter(Position=0, Mandatory=$false)]
    [string]$Message
)

# 1. Check if we are inside a Git repo
git rev-parse --is-inside-work-tree >$null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Current directory is not a Git repository!" -ForegroundColor Red
    return
}

# 2. Check remote repository
$remoteUrl = git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrEmpty($remoteUrl)) {
    Write-Host "Error: Remote origin not found!" -ForegroundColor Red
    return
}

# 3. Check for modifications
$status = git status --porcelain
if ([string]::IsNullOrEmpty($status)) {
    Write-Host "Clean: No changes detected to commit." -ForegroundColor Green
    return
}

Write-Host ""
Write-Host "[Files] Detected modified files:" -ForegroundColor Cyan
git status -s

# 4. Stage all changes
Write-Host ""
Write-Host "Staging changes..." -ForegroundColor DarkGray
git add -A

# 4.5. Security Check (防止敏感密钥和关键凭据意外泄漏)
Write-Host ""
Write-Host "[Security] Scanning staged files for sensitive data..." -ForegroundColor DarkYellow
$stagedFiles = git diff --cached --name-only
$hasSecret = $false

foreach ($file in $stagedFiles) {
    if (Test-Path -Path $file -PathType Leaf) {
        $filename = Split-Path -Leaf $file
        if ($filename -match "\.env$" -or $filename -match "\.pem$" -or $filename -match "\.key$" -or $filename -match "id_rsa") {
            Write-Host "❌ ALERT: Detected sensitive config or key file: '$file'!" -ForegroundColor Red
            $hasSecret = $true
            continue
        }
        
        $content = Get-Content -Raw -Path $file 2>$null
        if ($content) {
            # 常见敏感前缀与凭证正则匹配 (使用单引号字符串，避免 PowerShell 转义问题)
            if ($content -match 'sk-[a-zA-Z0-9-]{20,}' -or 
                $content -match 'AIzaSy[a-zA-Z0-9_-]{35}' -or
                $content -match '(?i)jwt_secret\s*[:=]\s*["''`][a-zA-Z0-9_-]{10,}["''`]' -or
                $content -match '(?i)secret_key\s*[:=]\s*["''`][a-zA-Z0-9_-]{10,}["''`]' -or
                $content -match '(?i)password\s*[:=]\s*["''`][a-zA-Z0-9_-]{8,}["''`]') {
                Write-Host "❌ ALERT: Detected hardcoded API Key or Secret credential in '$file'!" -ForegroundColor Red
                $hasSecret = $true
            }
        }
    }
}

if ($hasSecret) {
    Write-Host ""
    Write-Host "⚠️ Security Block: Push blocked to prevent secret exposure." -ForegroundColor Red
    Write-Host "Please remove the hardcoded secrets or move them to a secure untracked file (e.g. .env)." -ForegroundColor Yellow
    Write-Host "Undoing staging to protect your files..." -ForegroundColor Gray
    git reset
    return
}

# 5. Determine commit message
if ([string]::IsNullOrEmpty($Message)) {
    if ($env:CI -eq "true") {
        $Message = "update: auto-sync at (CI) $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    } else {
        Write-Host ""
        Write-Host "[Message] Enter commit message (or press Enter to auto-generate):" -ForegroundColor Cyan
        $inputMsg = Read-Host "> "
        if (-not [string]::IsNullOrEmpty($inputMsg)) {
            $Message = $inputMsg.Trim()
        } else {
            $changedFiles = git diff --cached --name-only
            $fileList = ($changedFiles -split "`r`n" -split "`n" | Where-Object { $_ })
            $date = Get-Date -Format "yyyy-MM-dd HH:mm"
            if ($fileList.Count -eq 1) {
                $Message = "update: modified $($fileList[0]) at $date"
            } elseif ($fileList.Count -gt 1) {
                $Message = "update: modified $($fileList.Count) files including $($fileList[0]) at $date"
            } else {
                $Message = "update: auto-sync at $date"
            }
        }
    }
}

Write-Host ""
Write-Host "[Commit] Committing changes: '$Message'" -ForegroundColor Gray
git commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Commit failed!" -ForegroundColor Red
    return
}

# 6. Push to remote
$currentBranch = git branch --show-current
Write-Host ""
Write-Host "[Push] Pushing to remote ($currentBranch)..." -ForegroundColor Cyan

git push origin $currentBranch
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "🎉 Success! Changes pushed to origin [$currentBranch] successfully." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Error: Push failed! Check your connection or remote permissions." -ForegroundColor Red
}
