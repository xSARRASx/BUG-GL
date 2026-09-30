"""Offline regression suite. Fixture HTTP and SQLite are local, never client sites."""
import base64
from concurrent.futures import ThreadPoolExecutor
import contextlib
import http.client
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest

import server as s

SHA = 'a'*40

def fixtures(path):
    if path.startswith('/branches/'):
        return {'commit':{'sha':SHA}}
    if path.startswith('/contents/'):
        text = json.dumps({'dryRun':True,'autoTermine':False,'allowScheduledActive':False}) if 'config.json' in path else '# Point de reprise\nFaits datés.\nNe rien modifier.'
        return {'encoding':'base64','content':base64.b64encode(text.encode()).decode()}
    if path=='/actions/runs?per_page=30':
        return {'workflow_runs':[{'id':19,'run_number':19,'path':s.WORKFLOW,'head_branch':s.BRANCH,
                                 'head_sha':SHA,'event':'schedule','conclusion':'success','status':'completed'},
                                {'id':20,'path':'else.yml','head_branch':s.BRANCH}]}
    if path.endswith('/jobs?per_page=20'):
        return {'jobs':[{'id':1,'name':'Audit','conclusion':'success','secret':'ne doit pas sortir'}]}
    return {'id':19,'path':s.WORKFLOW,'head_branch':s.BRANCH,'event':'schedule','conclusion':'success'}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.j = s.Journal(self.tmp.name+'/private')
        self.g = s.GithubReader(fixtures)
        self.a = s.Application(self.j,self.g)
    def save(self, request='req-1', version=0, **kw):
        data = dict(request_id=request, expected_version=version, session='conv-A', titre='Étape',
                    resume='Audit observé et documenté.', prochaine_etape='Vérifier les preuves avant toute action.')
        data.update(kw)
        return self.j.save(**data)
    def prepare(self, request='prep-1', **kw):
        data=dict(request_id=request, session='conv-A',tache='audit-doc',objectif='Vérification uniquement.',expected_version=0)
        data.update(kw)
        return self.j.prepare(**data)
    def finish(self, op, request='end-1', **kw):
        data=dict(request_id=request,session='conv-A',operation_id=op['operation_id'],expected_revision=1,
                  etat='verifiee',preuve='Run GitHub 19 ; déclaration de l’assistant, à recouper.')
        data.update(kw)
        return self.j.finish(**data)


class JournalTests(Base):
    def test_empty(self): self.assertEqual(self.j.current()['version'],0)
    def test_save(self): self.assertEqual(self.save()['version'],1)
    def test_store_identity_survives_restart(self):
        self.assertEqual(self.j.instance_id,s.Journal(self.j.folder).instance_id)
    def test_separate_stores_have_different_identity(self):
        self.assertNotEqual(self.j.instance_id,s.Journal(self.tmp.name+'/other').instance_id)
    def test_persistence(self):
        self.save()
        second=s.Journal(self.j.folder)
        self.assertEqual(second.current()['checkpoint']['titre'],'Étape')
    def test_idempotency_after_restart(self):
        one=self.save(); self.j=s.Journal(self.j.folder)
        self.assertEqual(self.save(),one)
        self.assertEqual(len(self.j.history()['items']),1)
    def test_request_id_collision(self):
        self.save()
        with self.assertRaises(s.Refus): self.save(resume='Texte changé')
    def test_stale_version(self):
        self.save()
        with self.assertRaises(s.Refus): self.save(request='req-2')
    def test_version_increment(self):
        self.save(); self.assertEqual(self.save('req-2',1)['version'],2)
    def test_concurrent_sessions(self):
        def attempt(i):
            try: return self.save(request='req-'+str(i))['version']
            except s.Refus: return None
        with ThreadPoolExecutor(max_workers=8) as pool: results=list(pool.map(attempt,range(8)))
        self.assertEqual(results.count(1),1)
        self.assertEqual(self.j.current()['version'],1)
    def test_cross_process_concurrency(self):
        code='import server,sys; j=server.Journal(sys.argv[1]);\ntry: j.save(sys.argv[2],0,"conv","Titre","Résumé","Suite"); print("ok")\nexcept server.Refus: print("conflict")'
        ps=[subprocess.Popen([sys.executable,'-c',code,str(self.j.folder),'proc-'+str(i)],cwd=Path(s.__file__).parent,stdout=subprocess.PIPE,stderr=subprocess.PIPE) for i in range(4)]
        outputs=[p.communicate(timeout=10)[0].strip() for p in ps]
        self.assertEqual(outputs.count(b'ok'),1)
    def test_literal_history_search(self):
        self.save(resume='Littéral %_ et décision')
        self.assertEqual(len(self.j.history('%_')['items']),1)
        self.assertEqual(len(self.j.history("' OR 1=1 --")['items']),0)
    def test_pagination(self):
        for i in range(5): self.save('r'+str(i),i)
        first=self.j.history(limite=2); second=self.j.history(cursor=first['next_cursor'],limite=2)
        self.assertTrue(set(x['seq'] for x in first['items']).isdisjoint(x['seq'] for x in second['items']))
    def test_backup(self):
        self.save(); b=self.j.backup(); p=self.j.folder/'backups'/b['fichier']
        with sqlite3.connect(p) as db: self.assertEqual(db.execute('select version from checkpoint').fetchone()[0],1)
        self.assertEqual(p.stat().st_mode & 0o077,0)
    def test_no_git_journal(self):
        p=Path(self.tmp.name)/'repo'; p.mkdir(); (p/'.git').mkdir()
        with self.assertRaises(s.Refus): s.Journal(p/'state')
    def test_no_symlink_journal(self):
        p=Path(self.tmp.name)/'link'; p.symlink_to(self.j.folder)
        with self.assertRaises(s.Refus): s.Journal(p)
    def test_private_permissions(self):
        self.assertEqual(self.j.folder.stat().st_mode & 0o077,0)
        self.assertEqual(self.j.path.stat().st_mode & 0o077,0)
    def test_reject_secret(self):
        with self.assertRaises(s.Refus): self.save(resume='password: faux-secret')
        self.assertEqual(self.j.current()['version'],0)
    def test_empty_checkpoint(self):
        with self.assertRaises(s.Refus): self.save(titre=' ')
    def test_max_size(self):
        with self.assertRaises(s.Refus): self.save(resume='a'*8001)
    def test_bool_not_integer(self):
        with self.assertRaises(s.Refus): self.save(version=True)
    def test_rollback_does_not_log(self):
        self.save()
        with self.assertRaises(s.Refus): self.save('refused',0)
        self.assertEqual(len(self.j.history()['items']),1)


class OperationTests(Base):
    def test_prepare_no_business_action(self): self.assertFalse(self.prepare()['action_metier_executee'])
    def test_prepare_idempotent(self): self.assertEqual(self.prepare(),self.prepare())
    def test_task_exclusion(self):
        self.prepare()
        with self.assertRaises(s.Refus): self.prepare('prep-B',session='conv-B')
    def test_expiration_never_releases_task(self):
        op=self.prepare()
        with self.j.connect() as db: db.execute('update operations set lease_until=0')
        with self.assertRaises(s.Refus): self.prepare('prep-B',session='conv-B')
        self.assertTrue(self.j.operations()['items'][0]['controle_requis'])
    def test_other_session_cannot_finish_active(self):
        op=self.prepare()
        with self.assertRaises(s.Refus): self.finish(op,session='conv-B')
    def test_other_session_reconciliation_after_expiry(self):
        op=self.prepare()
        with self.j.connect() as db: db.execute('update operations set lease_until=0')
        result=self.finish(op,session='conv-B')
        self.assertEqual(result['etat'],'verifiee')
        self.assertFalse(result['preuve_verifiee_par_serveur'])
    def test_cannot_reexecute_expired(self):
        op=self.prepare()
        with self.j.connect() as db: db.execute('update operations set lease_until=0')
        with self.assertRaises(s.Refus): self.finish(op,session='conv-B',etat='en_cours')
    def test_finish_idempotent(self):
        op=self.prepare(); a=self.finish(op); self.assertEqual(a,self.finish(op))
    def test_revision_conflict(self):
        op=self.prepare(); self.finish(op,etat='en_cours')
        with self.assertRaises(s.Refus): self.finish(op,request='end-B')
    def test_no_proof(self):
        op=self.prepare()
        with self.assertRaises(s.Refus): self.finish(op,preuve='')
    def test_uncertain_preserved_after_restart(self):
        op=self.prepare(); self.finish(op,etat='incertaine')
        other=s.Journal(self.j.folder)
        self.assertEqual(other.operations()['items'][0]['state'],'incertaine')
    def test_release_after_reconciliation(self):
        op=self.prepare(); self.finish(op)
        self.assertEqual(self.j.operations()['items'],[])
        self.assertNotEqual(self.prepare('new')['operation_id'],op['operation_id'])


class GithubTests(Base):
    def test_head_and_flags(self):
        r=self.g.state(); self.assertTrue(r['verifie']); self.assertEqual(r['head'],SHA)
        self.assertTrue(r['configuration']['dryRun'])
    def test_repo_filter(self): self.assertEqual(len(self.g.state()['executions']),1)
    def test_error_is_not_stopped_robot(self):
        self.g.loader=lambda _: (_ for _ in ()).throw(s.Refus('github_http_403'))
        r=self.g.state(); self.assertFalse(r['verifie']); self.assertIn('pas preuve',r['attention'])
    def test_config_pinned_at_head(self):
        calls=[]
        def load(p): calls.append(p); return fixtures(p)
        s.GithubReader(load).state()
        self.assertTrue(any('ref='+SHA in x for x in calls))
    def test_document_path_guard(self):
        with self.assertRaises(s.Refus): self.g.document('../../.env')
    def test_api_path_guard(self):
        with self.assertRaises(s.Refus): self.g.get('/secrets')
    def test_no_raw_jobs(self):
        self.assertNotIn('secret',s.dump(self.g.run(19)))
    def test_foreign_workflow_rejected(self):
        self.g.loader=lambda _: {'path':'other.yml','head_branch':s.BRANCH}
        with self.assertRaises(s.Refus): self.g.run(19)
    def test_cache(self):
        calls=[]
        def load(p): calls.append(p); return fixtures(p)
        g=s.GithubReader(load); g.head();g.head();self.assertEqual(len(calls),1)
    def test_source_refs(self): self.assertIn(SHA,self.g.document('reprise')['source'])


class ProtocolTests(Base):
    def call(self,method,params=None):return self.a.rpc({'jsonrpc':'2.0','id':1,'method':method,'params':params or {}})
    def test_initialize(self):
        r=self.call('initialize',{'protocolVersion':'2025-11-25'})['result']
        self.assertEqual(r['protocolVersion'],'2025-11-25');self.assertIn('reprendre_robot',r['instructions'])
    def test_version_negotiation(self):self.assertEqual(self.call('initialize',{'protocolVersion':'future'})['result']['protocolVersion'],s.PROTOCOLS[0])
    def test_tools(self): self.assertEqual(len(self.call('tools/list')['result']['tools']),9)
    def test_no_forbidden_tools(self):
        names=[t['name'] for t in s.TOOLS]
        self.assertFalse(any('lancer' in n or 'supprimer' in n or 'wordpress' in n for n in names))
    def test_annotations_truthful(self):
        t=next(t for t in s.TOOLS if t['name']=='enregistrer_checkpoint');self.assertFalse(t['annotations']['readOnlyHint'])
    def test_unknown_tool(self):self.assertTrue(self.call('tools/call',{'name':'exec','arguments':{}})['result']['isError'])
    def test_bootstrap(self):
        r=self.a.invoke('reprendre_robot',{});self.assertIn('dossier_github',r);self.assertEqual(r['reprise']['version'],0)
        self.assertFalse(r['permissions_effectives']['ecriture_wordpress'])
    def test_unknown_arguments(self):
        with self.assertRaises(s.Refus): self.a.invoke('etat_robot',{'url':'https://other.invalid'})
    def test_document_pagination(self):
        r=self.a.invoke('lire_document_robot',{'nom':'reprise','limite':1})
        self.assertEqual(r['next_debut'],1)
    def test_notifications_do_not_write(self):
        r=self.a.rpc({'jsonrpc':'2.0','method':'tools/call','params':{'name':'enregistrer_checkpoint'}})
        self.assertIsNone(r);self.assertEqual(self.j.current()['version'],0)
    def test_batch_rejected(self):self.assertEqual(self.a.rpc([])['error']['code'],-32600)
    def test_invalid_json_version(self):self.assertEqual(self.a.rpc({'method':'ping'})['error']['code'],-32600)
    def test_nonfinite_json_rejected(self):
        with self.assertRaises(ValueError):s.decode(b'{"a":NaN}')
    def test_resources(self):self.assertEqual(len(self.call('resources/list')['result']['resources']),2)
    def test_resource_does_not_read_files(self):self.assertIn('error',self.call('resources/read',{'uri':'file:///etc/passwd'}))
    def test_prompt(self):self.assertIn('messages',self.call('prompts/get',{'name':'reprendre'})['result'])
    def test_stdio_process(self):
        lines=[{'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'test','version':'1'}}},
               {'jsonrpc':'2.0','method':'notifications/initialized'}, {'jsonrpc':'2.0','id':2,'method':'tools/list'}]
        out=subprocess.run([sys.executable,s.__file__,'--data-dir',str(self.j.folder)],input='\n'.join(map(s.dump,lines))+'\n',text=True,capture_output=True,timeout=10)
        self.assertEqual(out.returncode,0); data=[json.loads(x) for x in out.stdout.splitlines()]
        self.assertEqual(len(data),2);self.assertEqual(len(data[1]['result']['tools']),9)
    def test_actual_process_restart_resume(self):
        msg=[{'jsonrpc':'2.0','id':1,'method':'initialize','params':{}},
             {'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':'enregistrer_checkpoint','arguments':{'request_id':'across','session':'A','expected_version':0,'titre':'Étape persistée','resume':'Survit à une coupure','prochaine_etape':'Reprendre sans répétition'}}}]
        out=subprocess.run([sys.executable,s.__file__,'--data-dir',str(self.j.folder)],input='\n'.join(map(s.dump,msg))+'\n',text=True,capture_output=True,timeout=10)
        self.assertEqual(out.returncode,0)
        self.assertEqual(s.Journal(self.j.folder).current()['checkpoint']['titre'],'Étape persistée')


class HTTPTests(Base):
    def setUp(self):
        super().setUp()
        self.token='F'*40
        self.http=s.make_http(self.a,0,self.token)
        self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start()
        self.addCleanup(self.http.server_close);self.addCleanup(self.http.shutdown)
    def req(self,headers=None,path='/mcp',method='POST',body=None):
        h={'Authorization':'Bearer '+self.token,'Content-Type':'application/json','Accept':'application/json, text/event-stream'}
        h.update(headers or {})
        data=body if body is not None else s.dump({'jsonrpc':'2.0','id':1,'method':'initialize','params':{}})
        c=http.client.HTTPConnection('127.0.0.1',self.http.server_port,timeout=3)
        c.request(method,path,data if method=='POST' else None,h)
        r=c.getresponse(); status=r.status; raw=r.read();c.close()
        return status,json.loads(raw) if raw else None
    def test_requires_auth(self):self.assertEqual(self.req({'Authorization':''})[0],401)
    def test_initialize_on_real_socket(self):self.assertEqual(self.req()[1]['result']['serverInfo']['version'],s.VERSION)
    def test_bad_origin(self):self.assertEqual(self.req({'Origin':'https://hostile.invalid'})[0],403)
    def test_bad_host(self):self.assertEqual(self.req({'Host':'evil.invalid'})[0],403)
    def test_token_not_in_url(self):self.assertEqual(self.req({'Authorization':''},path='/mcp?token='+self.token)[0],401)
    def test_notification_accepted(self):self.assertEqual(self.req(body=s.dump({'jsonrpc':'2.0','method':'notifications/initialized'})),(202,None))
    def test_get_405(self):self.assertEqual(self.req(method='GET')[0],405)
    def test_protocol_header(self):self.assertEqual(self.req({'MCP-Protocol-Version':'bad'})[0],400)
    def test_content_type(self):self.assertEqual(self.req({'Content-Type':'text/plain'})[0],415)
    def test_accept(self):self.assertEqual(self.req({'Accept':'text/html'})[0],406)
    def test_too_large(self):self.assertEqual(self.req({'Content-Length':str(s.MAX_MESSAGE+1)},body='{}')[0],413)
    def test_invalid_json(self):self.assertEqual(self.req(body='{')[0],400)
    def test_token_requirement(self):
        with self.assertRaises(s.Refus):s.make_http(self.a,0,'short')


if __name__=='__main__':unittest.main(verbosity=2)
