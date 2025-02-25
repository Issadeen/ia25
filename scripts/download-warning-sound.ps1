# Download warning sound for session expiry
$url = "https://cdn.freesound.org/previews/411/411089_5121236-lq.mp3"
$soundsDir = ".\public\sounds"
$output = "$soundsDir\warning.mp3"

if (-not (Test-Path $soundsDir)) {
    New-Item -ItemType Directory -Force -Path $soundsDir
}

try {
    $webClient = New-Object System.Net.WebClient
    $webClient.DownloadFile($url, $output)
    Write-Host "Warning sound downloaded successfully to: $output" -ForegroundColor Green
} catch {
    Write-Host "Failed to download warning sound: $_" -ForegroundColor Red
    Write-Host "Please download any short warning MP3 sound manually and place it in $soundsDir\warning.mp3"
}
