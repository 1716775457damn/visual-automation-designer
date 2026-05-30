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

Write-Host "`n[Files] Detected modified files:" -ForegroundColor Cyan
git status -s

# 4. Stage all changes
Write-Host "`nStaging changes..." -ForegroundColor DarkGray
git add -A

# 5. Determine commit message
if ([string]::IsNullOrEmpty($Message)) {
    if ($env:CI -eq "true") {
        $Message = "update: auto-sync at (CI) $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    } else {
        Write-Host "`n[Message] Enter commit message (or press Enter to auto-generate):" -ForegroundColor Cyan
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

Write-Host "`n[Commit] Committing changes: '$Message'" -ForegroundColor Gray
git commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Commit failed!" -ForegroundColor Red
    return
}

# 6. Push to remote
$currentBranch = git branch --show-current
Write-Host "`n[Push] Pushing to remote ($currentBranch)..." -ForegroundColor Cyan

git push origin $currentBranch
if ($LASTEXITCODE -eq 0) {
    Write-Host "`n🎉 Success! Changes pushed to origin [$currentBranch] successfully." -ForegroundColor Green
} else {
    Write-Host "`nError: Push failed! Check your connection or remote permissions." -ForegroundColor Red
}
