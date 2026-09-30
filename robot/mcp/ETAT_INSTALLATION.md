# Installation du connecteur Robot SEO

Dernière mise à jour : 30 septembre 2026.
Périmètre : `xSARRASx/BUG-GL`, dossier `robot/mcp`, branche `claude/amazing-euler-U7YqQ`.

## VERDICT ACTUEL

**Le connecteur est maintenant installé sur le vrai Mac de Martin. Il n'est pas encore connecté à ChatGPT : le Secure MCP Tunnel dédié Robot SEO reste à créer puis à démarrer.**

Preuve Terminal du Mac, 30 septembre 2026 :
- commande : `python3 robot/mcp/install.py` depuis `/Users/more/BUG-GL` ;
- 75 tests : OK, 6,988 s ;
- `installe_sur_mac: true` ;
- `version_source: cce238d41d5f341e` ;
- configuration client : `/Users/more/Library/Application Support/RobotSEO-MCP/client-config.json` ;
- journal privé : `/Users/more/Library/Application Support/RobotSEO-MCP/state` ;
- sauvegarde SQLite créée ;
- `enregistre_codex: false` ;
- `connecte_chatgpt: false` ;
- `tunnel_securise_installe: false` ;
- `aucun_site_modifie: true`.

## Interface OpenAI vérifiée

ChatGPT :
- page Plugins disponible ;
- `Ajouter → Créer une application MCP` disponible ;
- mode de connexion `Tunnel` disponible ;
- nom actuellement saisi : `robot-seo-bug-gl` ;
- menu d'authentification disponible avec `OAuth`, `Sans authentification`, `OAuth ou sans authentification`.

OpenAI Platform :
- `Organization settings → Tunnels` disponible ;
- un ancien tunnel `guestlucky-code-prod-lecture-seule` existe ;
- **ne pas réutiliser, modifier ou supprimer ce tunnel** pour ce chantier.

Au dernier écran observé, aucun tunnel Robot SEO dédié n'était encore sélectionnable dans ChatGPT. Le champ tunnel de la nouvelle application était encore vide et seul l'ancien tunnel GuestLucky était suggéré.

## Choix d'authentification V1

Choisir **`Sans authentification`** dans la fenêtre ChatGPT pour cette V1.

Motif : le serveur `robot/mcp/server.py` ne fournit pas de flux OAuth utilisateur. Le Secure MCP Tunnel authentifie séparément `tunnel-client` auprès du control plane OpenAI avec sa clé runtime. Choisir OAuth dans ChatGPT ferait annoncer un mécanisme que le serveur n'implémente pas.

Ne jamais coller de clé API, token, mot de passe ou code d'appareil dans une conversation.

## Étapes restantes exactes

1. Dans ChatGPT, sélectionner `Sans authentification`, mais **ne pas cliquer Créer** tant que le tunnel dédié n'existe pas et n'est pas sain.
2. Dans OpenAI Platform → Organization settings → Tunnels, cliquer `Créer un tunnel`.
3. Créer un tunnel dédié nommé `robot-seo-bug-gl`, associé au contexte personnel/ChatGPT approprié. Ne toucher à aucun tunnel GuestLucky.
4. Télécharger/utiliser le `tunnel-client` officiel sur le Mac.
5. Initialiser un profil local stdio avec le nouveau `tunnel_id` et la commande MCP installée. Garder la clé runtime dans l'environnement/stockage privé, jamais dans GitHub ou le chat.
6. Exécuter `tunnel-client doctor --profile <profil> --explain`.
7. Exécuter `tunnel-client run --profile <profil>` et vérifier l'état healthy/ready.
8. Revenir dans ChatGPT, sélectionner ou coller le nouveau `tunnel_id`, garder `Sans authentification`, accepter l'avertissement puis créer l'application.
9. Tester `reprendre_robot` dans la conversation actuelle.
10. Test de continuité obligatoire avant « terminé » : conversation A enregistre un checkpoint fictif ; conversation B retrouve le même `journal_id`, la version et la prochaine étape. Tester une réponse perdue et un conflit de version sans toucher aux sites clients.
11. Mettre `robot/REPRISE.md` et ce fichier à jour avec les preuves de bout en bout.

## Sécurité et périmètre

Le MCP V1 lit GitHub et tient un journal privé local. Il n'expose aucune écriture GitHub/Firebase/WordPress et aucun déclenchement de workflow. La création du tunnel ne change pas ces permissions.

Aucun service payant ne doit être activé pour cette installation. Aucun tunnel ou secret de Leapway/GuestLucky production ne doit être réutilisé.

Le Mac doit rester allumé et `tunnel-client` actif pour que ChatGPT atteigne ce serveur local. Deux copies du journal sur deux machines ne se synchronisent pas.

## Réalisé avant l'installation Mac

Le serveur, ses neuf outils MCP, deux ressources, un prompt de reprise, SQLite versionné/idempotent, l'installateur et 75 tests avaient déjà été construits et testés dans un environnement Linux isolé. Une session ultérieure avait aussi revérifié 212/212 tests du robot historique. Ces vérifications restent historiques ; la preuve Mac ci-dessus est désormais l'état d'installation pertinent.

## À ne pas faire

- ne pas cliquer sur l'ancien tunnel `guestlucky-code-prod-lecture-seule` ;
- ne pas sélectionner OAuth pour cette V1 ;
- ne pas cliquer `Créer` dans ChatGPT avant que le tunnel Robot SEO soit créé et ready ;
- ne pas publier le serveur HTTP local ;
- ne pas coller de secret dans le chat ;
- ne pas modifier Firebase, WordPress, les statuts ou les règles du robot pendant le branchement MCP.
