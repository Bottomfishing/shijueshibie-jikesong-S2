import type { PointerState } from '../types'
export type StoryPhase = 'intro'|'pullIn'|'tunnel'|'forum'|'video'|'live'|'search'|'ai'|'return'
const ORDER: StoryPhase[] = ['intro','pullIn','tunnel','forum','video','live','search','ai','return']
const LIMITS: Record<StoryPhase, number> = { intro:18,pullIn:3,tunnel:8,forum:24,video:24,live:24,search:24,ai:24,return:12 }
export class StoryDirector {
  phase: StoryPhase = 'intro'; phaseTime = 0; progress = 0
  update(dt:number, pointer:PointerState): StoryPhase|null { this.phaseTime += dt; const engaged=pointer.active&&(pointer.traveled>1||pointer.energy>.2); const advance=this.phase==='intro'?((engaged&&this.phaseTime>2)||this.phaseTime>LIMITS.intro):this.phaseTime>LIMITS[this.phase]; if(!advance)return null; const i=ORDER.indexOf(this.phase); if(i>=ORDER.length-1)return null; this.phase=ORDER[i+1]; this.phaseTime=0; this.progress=i+1; return this.phase }
  jumpTo(phase:StoryPhase):void { this.phase=phase; this.phaseTime=0; this.progress=ORDER.indexOf(phase) }
  reset():void { this.jumpTo('intro') }
}
