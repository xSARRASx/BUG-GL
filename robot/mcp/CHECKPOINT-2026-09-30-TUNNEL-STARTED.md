# Checkpoint MCP Robot SEO — tunnel démarré

Date : 30 septembre 2026.

Preuves copiées depuis le Terminal du Mac de Martin :

- le serveur MCP stdio a été lancé depuis l'installation RobotSEO-MCP ;
- le listener santé écoute sur 127.0.0.1:8768 ;
- le poller du control plane OpenAI a démarré ;
- les métadonnées du tunnel robot-seo-bug-gl ont été récupérées ;
- tunnel-client a affiché « tunnel-client started » ;
- version tunnel-client : 0.0.14 ;
- aucun secret n'est enregistré dans ce fichier.

État : le daemon tourne au premier plan dans le Terminal de Martin. Ce Terminal doit rester ouvert.

Prochaine vérification : depuis un second Terminal, appeler http://127.0.0.1:8768/readyz. Si ready, revenir dans ChatGPT Plugins, créer l'application MCP robot-seo-bug-gl avec connexion Tunnel, sélectionner le tunnel robot-seo-bug-gl, authentification Sans authentification, puis tester l'outil reprendre_robot.

Ne pas réutiliser le tunnel guestlucky-code-prod-lecture-seule. Ne pas modifier Firebase, WordPress, le workflow ou les permissions métier pendant ce test.
