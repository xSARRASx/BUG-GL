# Installation du connecteur Robot SEO

Dernière mise à jour : 30 septembre 2026.
Départ du chantier : `7e2589fbd791d604f2cc44df7148f8ef5e989158`.
Périmètre : `xSARRASx/BUG-GL`, dossier `robot/mcp`, branche `claude/amazing-euler-U7YqQ`.

## Verdict actuel

**Le code du connecteur est construit, testé dans l'environnement de travail et enregistré dans GitHub. Il n'est PAS installé sur le Mac, PAS déployé sur un hébergement permanent et PAS ajouté aux connexions ChatGPT.**

Ne pas confondre serveur prêt à installer, processus de test local et connexion opérationnelle accessible à une nouvelle conversation.

## Réalisé et vérifié

- Serveur Python autonome `server.py` : neuf outils MCP, deux ressources et un prompt de reprise. Transport stdio ; transport HTTP JSON facultatif limité à la boucle locale et protégé par un jeton privé.
- Lecture GitHub restreinte au Robot SEO : HEAD, configuration au même SHA, documents autorisés et résumés des exécutions. Les réponses incluent dates, provenance et limites de lecture.
- Journal SQLite privé, hors dépôt : checkpoints versionnés, historique conservé, reçus idempotents, réservation des tâches, refus des écrasements concurrents et suivi des résultats incertains.
- Script `install.py` pour le vrai Mac : copie versionnée, journal et secrets existants préservés, configuration client, option d'enregistrement Codex sans remplacement d'une connexion existante.
- Procédure réutilisable `skills/reprise-robot-seo/SKILL.md` ; documentation, sauvegarde SQLite et exclusions Git.
- **75 tests réussis**, dernière exécution : `python3 -m unittest test_server -v`, Python 3.13.5, Linux isolé, durée 8,589 secondes. Tests de redémarrage de processus, concurrence entre processus, idempotence, recherche paginée, protection des tâches et transports sur de vrais sockets locaux.
- Identité vérifiée entre les sources testées localement et les blobs GitHub : serveur `4493a6a79d947f8788e9ca4366afa0426ce52a42`, tests `3b7fa488c96b4ade61b13e61efd311f2ed2199ee`, installateur `4be0e3dd49d3188e0f18954eb6f2ed4e0a6b7ac0`.
- Le refus d'installation hors Mac a été exercé : le script s'arrête sur Linux sans prétendre configurer le Mac.

## Ce que ces tests ne prouvent pas

Les lectures GitHub du serveur sont testées avec des réponses fictives. Les accès réels aux sources via le connecteur GitHub de cette conversation ne prouvent pas la connectivité réseau du futur serveur. L'environnement de construction ne permettait pas l'installation du SDK MCP officiel par pip ni une lecture GitHub depuis Python, à cause d'une résolution réseau indisponible.

La V1 implémente un sous-ensemble MCP explicite avec la bibliothèque standard. Aucun test avec MCP Inspector, un tunnel OpenAI réel ou une nouvelle conversation ChatGPT n'est revendiqué. Les 212 tests historiques du robot ne sont pas réexécutés par cette suite ; le code historique du robot n'a pas été modifié.

## Blocage exact

Le terminal fourni à l'assistant est un environnement Linux isolé, pas le terminal du Mac de Martin. Les actions Plugin Management présentes permettent de consulter ou régler des permissions, mais pas d'installer une nouvelle connexion ni d'approuver la connexion ChatGPT.

L'unique projet Supabase découvert appartient à Leapway et n'a pas été utilisé. Aucun tunnel, secret ou serveur de production GuestLucky n'a été réutilisé. Aucun service payant, projet cloud, nouvel accès externe ou permission globale n'a été créé.

## Prochaine étape pour une session ayant réellement accès au Mac

1. Lire ce fichier, `robot/AGENTS.md`, `robot/REPRISE.md` et `robot/mcp/README.md`. Vérifier le dépôt, la branche et le HEAD réel ; préserver tout travail concurrent.
2. Vérifier la présence de Python 3.11+ et du terminal Mac. Lancer `python3 robot/mcp/install.py` dans la copie autorisée du dépôt. Aucun sudo. Ne pas créer une deuxième base si un journal existe déjà.
3. Connecter le programme stdio installé à un Secure MCP Tunnel dédié au Robot SEO, avec les autorisations du compte et sans réutiliser les tunnels des autres projets. Vérifier la disponibilité de cette fonction sur le compte. Ne pas publier le serveur HTTP local tel quel sur Internet.
4. Enregistrer et autoriser la connexion dans ChatGPT. Si une confirmation utilisateur est indispensable, demander uniquement cette confirmation ; aucun mot de passe ni token dans la conversation.
5. Tester avec un client MCP réel puis deux nouvelles conversations : la première enregistre un checkpoint fictif ; la seconde relit le même `journal_id`, la même version et la prochaine étape. Tester aussi une réponse perdue et un conflit de version, sans toucher aux clients.
6. Mettre ce document et `robot/REPRISE.md` à jour avec les preuves réelles. Ne passer à « connecté et terminé » qu'après ce test de bout en bout.

## Limites de continuité

Le journal se partage entre les conversations qui appellent la même instance du serveur avec la même base sur une machine persistante. Deux copies sur deux machines ne se synchronisent pas. Avec un hébergement sur le Mac, il faut que le Mac et son tunnel restent disponibles.

Ce MCP ne reçoit pas spontanément tous les messages : l'agent doit enregistrer les décisions importantes par checkpoint. Il n'a pas de commande de correction WordPress, de lancement de workflow ou d'accès aux fiches Firebase privées. La mention « connecté au robot » désigne ici sa lecture GitHub, pas une ouverture de droits métier.

Aucun site, statut, règle Firebase ou réglage du robot n'a été modifié dans ce chantier.
