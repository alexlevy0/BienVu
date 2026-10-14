"""Original 120 BPM instrumental. Pure synthesis, no samples or paid services.
The campaign JSON is the shared clock for picture edits and musical accents.
"""
import json, math, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CAMPAIGN = json.loads((ROOT / 'campaigns/2026-10-launch.json').read_text())
SR, BPM = 48000, CAMPAIGN['bpm']
BEAT, DURATION = 60 / BPM, CAMPAIGN['durationSeconds']
rng = np.random.default_rng(20261014)
N = round(DURATION * SR)
drums, harmony, lead, accents = [np.zeros((N, 2), dtype=np.float64) for _ in range(4)]

def add(bus, signal, seconds, gain=1.0, pan=0.0):
    start = round(seconds * SR)
    if start >= N: return
    length = min(len(signal), N - start)
    if length <= 0: return
    if signal.ndim == 1:
        stereo = np.column_stack((signal * math.sqrt((1-pan)/2), signal * math.sqrt((1+pan)/2)))
    else: stereo = signal
    bus[start:start+length] += stereo[:length] * gain

def envelope(t, attack=.008, release=.15, sustain=1):
    return np.minimum(1, t/attack) * np.minimum(1, np.maximum(0, (t[-1]-t)/release)) * sustain

def note(midi): return 440 * 2 ** ((midi-69)/12)

def tone(midi, duration, kind='pluck'):
    t=np.arange(round(duration*SR))/SR; freq=note(midi)
    if kind == 'pad':
        signal = sum(np.sin(2*np.pi*(freq+d)*t) for d in [-.45,0,.45])/3
        signal += .12*np.sin(2*np.pi*freq*2*t)
        return signal*envelope(t,.14,.28)*.32
    if kind == 'bass':
        return (np.sin(2*np.pi*freq*t)+.15*np.sin(2*np.pi*freq*2*t))*envelope(t,.004,.10)*np.exp(-t*1.2)
    # Glassy bell with an airy second harmonic; pitch stays musical throughout.
    return (np.sin(2*np.pi*freq*t)+.24*np.sin(2*np.pi*freq*2*t)*np.exp(-t*8)+.07*np.sin(2*np.pi*freq*3*t))*np.exp(-t*4.5)*envelope(t,.004,.08)

def kick():
    t=np.arange(round(.36*SR))/SR
    freq=47+105*np.exp(-t*38)
    return np.sin(2*np.pi*np.cumsum(freq)/SR)*np.exp(-t*13)+.15*rng.normal(size=len(t))*np.exp(-t*220)

def hat(opened=False):
    t=np.arange(round((.20 if opened else .055)*SR))/SR
    noise=rng.normal(size=len(t)); high=noise-np.convolve(noise,np.ones(7)/7,mode='same')
    return high*np.exp(-t*(22 if opened else 85))*.2

def clap():
    t=np.arange(round(.19*SR))/SR; noise=rng.normal(size=len(t))
    high=noise-np.convolve(noise,np.ones(14)/14,mode='same')
    shape=sum(np.exp(-np.maximum(t-delay,0)*55)*(t>=delay) for delay in [0,.008,.017])
    return high*shape*.15+np.sin(2*np.pi*190*t)*np.exp(-t*32)*.06

# Fmaj7 / C / Am7 / Gadd9: bright, warm, and consistent with BienVu's identity.
chords=[([53,57,60,64],41),([48,55,60,64],36),([57,60,64,67],45),([55,59,62,69],43)]
for bar in range(18):
    chord, bass=chords[(bar//2)%4]; start=bar*4*BEAT
    for pitch in chord: add(harmony,tone(pitch,2.5,'pad'),start,.12,pan=(pitch-chord[0])/28-.2)
    energetic=bar>=3 and bar not in [5,6,7]
    for beat in range(4):
        when=start+beat*BEAT
        if bar<16 or beat==0: add(drums,kick(),when,.60 if energetic else .42)
        if beat in [1,3] and bar<16: add(drums,clap(),when,.65 if energetic else .4)
        add(harmony,tone(bass,.32,'bass'),when+.02,.31 if bar>=3 else .19)
        if beat in [0,2]: add(harmony,tone(bass+12,.18,'bass'),when+.375,.12)
    for eighth in range(8):
        if bar<16: add(drums,hat(eighth%2==1),start+eighth*BEAT/2,.42 if energetic else .23,(-.45 if eighth%2 else .4))
    arpeggio=[0,1,2,3,2,1,3,2]
    for eighth, index in enumerate(arpeggio):
        when=start+eighth*BEAT/2
        sound=tone(chord[index]+12,.55)
        add(lead,sound,when,.08 if bar<3 else .115,(-.18 if eighth%2 else .18))
        add(lead,sound,when+.375,.026,(-.6 if eighth%2 else .6))

for when in [6,10,16,22,28,32]:
    # Short stereo sweep ending exactly on the change of scene.
    t=np.arange(round(.55*SR))/SR
    noise=rng.normal(size=len(t)); noise=np.convolve(noise,np.ones(9)/9,mode='same')
    sweep=noise*np.linspace(0,.17,len(t))*np.sin(np.pi*np.linspace(0,1,len(t)))
    add(accents,sweep,when-.55,pan=-.25)
    add(accents,tone(84,.7),when,.12,.25)

# Short, recognisable melodic lift over the showcase and publishing chapters.
melody=[(22,76),(22.75,79),(23.5,81),(24.5,79),(25,76),(26,74),(26.75,76),(28,79),(28.75,81),(29.5,84),(30.5,81),(31,79),(32,76)]
for when,pitch in melody:
    sound=tone(pitch,.85);add(lead,sound,when,.16);add(lead,sound,when+.375,.045,.5)

t=np.arange(N)/SR
# Deliberate space for the real spoken demonstration at 10–16 seconds.
duck=np.interp(t,[0,9.65,10,15.85,16.2,DURATION],[1,1,.26,.26,1,1])
sidechain=1-.16*np.exp(-((t%BEAT)/.075))
mix=drums*duck[:,None]+harmony*sidechain[:,None]*duck[:,None]+lead*duck[:,None]+accents
# A little room, without an endless wash over the transients.
delay=round(.125*SR);mix[delay:]+=.09*mix[:-delay,::-1]
fade=np.minimum(1,t/.08)*np.minimum(1,np.maximum(0,(DURATION-t)/.85))
mix=np.tanh(mix*.95)*fade[:,None]
mix *= .79/max(np.max(np.abs(mix)),1e-9)
out=ROOT/'public/audio';out.mkdir(parents=True,exist_ok=True)
with wave.open(str(out/'bienvu-momentum.wav'),'wb') as wav:
    wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(SR)
    wav.writeframes((np.clip(mix,-1,1)*32767).astype('<i2').tobytes())
(ROOT/'campaigns/music-provenance.json').write_text(json.dumps({'title':'BienVu Momentum','bpm':BPM,'durationSeconds':DURATION,'sampleRate':SR,'seed':20261014,'source':'Original local procedural synthesis','thirdPartySamples':False,'paidApiCalls':0},indent=2)+'\n')
print(json.dumps({'duration':DURATION,'bpm':BPM,'peak':float(np.max(np.abs(mix))),'rmsDb':float(20*np.log10(np.sqrt(np.mean(mix**2)))),'output':str(out/'bienvu-momentum.wav')}))
