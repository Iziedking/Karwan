import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import { automaticallyPublishCreDelivery, type CreAutoPublicationDependencies } from './creAutoPublication.js';

function harness() {
  let now = 1_800_000_000_000;
  let deal = { jobId:`0x${'a'.repeat(64)}`, evidenceRequired:true, delivered:true, acceptedAt:now-1000, deliveryRevision:1, agreementVersion:1, deliveryProof:'https://github.com/Iziedking/Karwan/pull/1' } as DirectDeal;
  const requests: unknown[] = [];
  let resolutions = 0;
  const deps: CreAutoPublicationDependencies = {
    enabled:true, now:()=>now, get:async()=>structuredClone(deal),
    update:async(snapshot, update)=>{
      if (snapshot.deliveryRevision !== deal.deliveryRevision || snapshot.agreementVersion !== deal.agreementVersion || snapshot.deliveryProof !== deal.deliveryProof || deal.cancelledAt || deal.settledAt) return null;
      const patch = update(deal);
      if (!patch) return null;
      deal = {...deal,...patch};
      return structuredClone(deal);
    },
    resolveSha: async()=>{ resolutions++; return 'b'.repeat(40); },
    publish:async(request)=>{ requests.push(request); return {ok:true}; },
  };
  return {deps, requests, get deal(){return deal;}, get resolutions(){return resolutions;}, advance:()=>{now+=61000;}, patch:(patch:Partial<DirectDeal>)=>{deal={...deal,...patch};}};
}

test('seller delivery pins and publishes once, with its actual repository and revision', async()=>{
  const h=harness();
  await Promise.all([automaticallyPublishCreDelivery(h.deal.jobId,h.deps), automaticallyPublishCreDelivery(h.deal.jobId,h.deps)]);
  h.advance();
  await automaticallyPublishCreDelivery(h.deal.jobId,h.deps);
  assert.equal(h.resolutions,1); assert.equal(h.requests.length,1);
  assert.equal(h.deal.creDeliveryRequest?.repositoryName,'Karwan');
  assert.equal(h.deal.creDeliveryRequest?.submittedSha,'b'.repeat(40));
  assert.equal(h.deal.creAutoPublication?.published,true);
});

test('disabled, ordinary, closed and held deliveries never call GitHub or publish',async()=>{
  for(const patch of [{evidenceRequired:false},{delivered:false},{cancelledAt:1},{settledAt:1},{disputed:true},{verificationStatus:'malicious' as const}]){
    const h=harness();h.patch(patch);await automaticallyPublishCreDelivery(h.deal.jobId,h.deps);
    assert.equal(h.resolutions,0);assert.equal(h.requests.length,0);
  }
  const h=harness();h.deps.enabled=false;await automaticallyPublishCreDelivery(h.deal.jobId,h.deps);assert.equal(h.resolutions,0);
});

test('a correction during the GitHub request cannot attach or publish the old proof',async()=>{
  const h=harness();h.deps.resolveSha=async()=>{h.patch({deliveryRevision:2,deliveryProof:'https://github.com/Iziedking/Karwan/pull/2'});return 'b'.repeat(40);};
  await automaticallyPublishCreDelivery(h.deal.jobId,h.deps);
  assert.equal(h.requests.length,0);assert.equal(h.deal.creDeliveryRequest,undefined);
});

test('recovery publishes the persisted SHA without resolving a changed PR again',async()=>{
  const h=harness();const publish=h.deps.publish;h.deps.publish=async()=>{throw Error('storage unavailable');};
  await automaticallyPublishCreDelivery(h.deal.jobId,h.deps);
  const request=h.deal.creDeliveryRequest;assert.ok(request);assert.equal(h.resolutions,1);
  h.advance();h.deps.publish=publish;h.deps.resolveSha=async()=>{throw Error('must reuse pinned SHA');};
  await automaticallyPublishCreDelivery(h.deal.jobId,h.deps);
  assert.deepEqual(h.requests[0],request);assert.equal(h.deal.creAutoPublication?.published,true);
});

test('unavailable provider reads stop after three persisted attempts',async()=>{
  const h=harness();let reads=0;h.deps.resolveSha=async()=>{reads++;throw Error('denied');};
  for(let i=0;i<6;i++){await automaticallyPublishCreDelivery(h.deal.jobId,h.deps);h.advance();}
  assert.equal(reads,3);assert.equal(h.requests.length,0);assert.equal(h.deal.creAutoPublication?.error,'github-unavailable');
});

test('invalid proof is recorded without following the submitted URL',async()=>{
  const h=harness();h.patch({deliveryProof:'https://evil.test/a'});await automaticallyPublishCreDelivery(h.deal.jobId,h.deps);
  assert.equal(h.resolutions,0);assert.equal(h.requests.length,0);assert.equal(h.deal.creAutoPublication?.error,'invalid-proof');
});
