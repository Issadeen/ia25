const fs = require('fs');
const { AudioContext: WebAudioContext, AudioBuffer: WebAudioBuffer } = require('web-audio-api');

// Create audio context
const audioContext = new WebAudioContext();

// Create a short beep sound
const sampleRate = 44100;
const duration = 0.1; // 100ms
const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
const channelData = buffer.getChannelData(0);

// Generate a simple sine wave
for (let i = 0; i < buffer.length; i++) {
    channelData[i] = Math.sin(440 * Math.PI * 2 * i / sampleRate);
}

// Export as WAV
const wav = require('node-wav');
const wavData = wav.encode([channelData], { sampleRate, float: true });
fs.writeFileSync('/c:/Users/issad/Desktop/issaerium-23-app/public/sounds/confirmation.wav', wavData);
