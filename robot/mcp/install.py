#!/usr/bin/env python3
"""Install privately on the REAL Mac. No sudo, purchases or shared-project changes.

Usage: python3 robot/mcp/install.py [--register-codex]
The installer copies versioned source, preserves the journal and writes client
configuration. It does not silently install a public tunnel or modify ChatGPT.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import secrets
import shlex
import shutil
import subprocess
import sys


def install(register_codex=False):
    if platform.system() != 'Darwin':
        raise RuntimeError('Installation Mac refusée : ce terminal n’est pas celui d’un Mac.')
    if sys.version_info < (3,11):
        raise RuntimeError('Python 3.11 ou plus récent requis ; aucune installation système automatique.')
    os.umask(0o077)
    source=Path(__file__).resolve().parent
    server=source/'server.py'
    if not server.is_file():
        raise RuntimeError('server.py absent : reprendre le dossier complet depuis GitHub.')
    # Verify shipped tests BEFORE installing. Offline, only temporary local sockets.
    subprocess.run([sys.executable,'-m','unittest','test_server','-q'],cwd=source,check=True)
    root=Path.home()/'Library/Application Support/RobotSEO-MCP'
    if root.is_symlink():
        raise RuntimeError('Dossier cible symbolique refusé.')
    root.mkdir(parents=True,mode=0o700,exist_ok=True)
    version=hashlib.sha256(server.read_bytes()).hexdigest()[:16]
    dest=root/'versions'/version
    dest.mkdir(parents=True,mode=0o700,exist_ok=True)
    target=dest/'server.py'
    if target.exists() and target.read_bytes()!=server.read_bytes():
        raise RuntimeError('Version locale différente : aucun écrasement automatique.')
    if not target.exists():
        shutil.copy2(server,target)
    state=root/'state'
    state.mkdir(mode=0o700,exist_ok=True)
    # Preserve existing token and journal on repeated installs.
    token=state/'http-token'
    if token.is_symlink():
        raise RuntimeError('Jeton symbolique refusé.')
    if not token.exists():
        fd=os.open(token,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f:f.write(secrets.token_urlsafe(48)+'\n')
    os.chmod(token,0o600)
    subprocess.run([sys.executable,str(target),'--data-dir',str(state),'--backup'],check=True)
    command=[sys.executable,str(target),'--data-dir',str(state)]
    config={'mcpServers':{'robot-seo':{'command':command[0],'args':command[1:]}}}
    config_path=root/'client-config.json'
    config_path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
    os.chmod(config_path,0o600)
    runner=root/'run-stdio.command'
    runner.write_text('#!/bin/sh\nexec '+ ' '.join(map(shlex.quote,command))+'\n')
    runner.chmod(0o700)
    registered=False
    if register_codex:
        cli=shutil.which('codex')
        if not cli:
            raise RuntimeError('Fichiers installés ; CLI Codex absente. Aucun réglage ChatGPT modifié.')
        # No direct editing of configuration and no removal of an existing server.
        found=subprocess.run([cli,'mcp','list','--json'],capture_output=True,text=True,check=True)
        entries=json.loads(found.stdout)
        if not isinstance(entries,list):
            raise RuntimeError('Format de la liste Codex inconnu : aucune configuration modifiée.')
        if any(e.get('name')=='robot-seo' for e in entries if isinstance(e,dict)):
            raise RuntimeError('Un connecteur robot-seo existe déjà : vérifier son chemin avant fusion. Aucun remplacement effectué.')
        subprocess.run([cli,'mcp','add','robot-seo','--',*command],check=True)
        registered=True
    receipt={'date':datetime.now(timezone.utc).isoformat(), 'version_source':version,
             'installe_sur_mac':True,'enregistre_codex':registered,
             'connecte_chatgpt':False,'tunnel_securise_installe':False,
             'configuration_client':str(config_path),'journal':str(state),
             'aucun_site_modifie':True}
    (root/'installation.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(receipt,ensure_ascii=False,indent=2))
    print('ChatGPT : relier ce programme stdio via un Secure MCP Tunnel autorisé ; terminer la connexion dans les réglages. Ne pas publier le jeton HTTP.')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--register-codex',action='store_true')
    args=p.parse_args()
    try:install(args.register_codex)
    except (RuntimeError,subprocess.CalledProcessError,ValueError) as exc:
        print(str(exc),file=sys.stderr);sys.exit(1)
