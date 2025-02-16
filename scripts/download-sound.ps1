# Use a direct link to a free sound effect from another source
$url = "https://cdn.freesound.org/previews/688/688846_14796340-lq.mp3"

# Use relative paths for Windows
$soundsDir = ".\public\sounds"
$output = "$soundsDir\confirmation.mp3"

# Create sounds directory if it doesn't exist
if (-not (Test-Path $soundsDir)) {
    New-Item -ItemType Directory -Force -Path $soundsDir
}

try {
    # Download with more robust error handling
    $webClient = New-Object System.Net.WebClient
    $webClient.DownloadFile($url, $output)
    Write-Host "Sound file downloaded successfully to: $output" -ForegroundColor Green
} catch {
    Write-Host "Failed to download sound file: $_" -ForegroundColor Red
    Write-Host "Please download any short MP3 sound manually and place it in $soundsDir\confirmation.mp3"
}
