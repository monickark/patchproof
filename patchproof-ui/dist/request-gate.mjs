// The browser also needs a guard: an old HTTP response must not replace a newer
// accepted server snapshot. Cancellation is best-effort; the generation is final.
export class RequestGate {
  generation=0; pending=false;
  cancel(){this.controller?.abort();this.generation++;this.pending=false;}
  async run(work,{accept=()=>{},error=()=>{},settled=()=>{}}={}){
    this.controller?.abort();this.controller=new AbortController();
    const generation=++this.generation;this.pending=true;
    try {const value=await work(this.controller.signal);if(generation!==this.generation)return false;accept(value);return true;}
    catch(cause){if(generation!==this.generation)return false;error(cause);return false;}
    finally {if(generation===this.generation){this.pending=false;settled();}}
  }
}
