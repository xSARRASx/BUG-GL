# Checkpoint MCP Robot SEO — tunnel ready

Date : 30 septembre 2026.

Preuve fournie depuis un second Terminal sur le Mac de Martin :

`curl -fsS http://127.0.0.1:8768/readyz`

Résultat visible : `ready`.

Conclusion : le tunnel-client est démarré, le listener santé répond et le runtime est prêt côté Mac.

Le premier Terminal qui exécute tunnel-client doit rester ouvert pendant la création et les tests du plugin ChatGPT.

Prochaine étape :
1. ChatGPT → Paramètres → Plugins → Ajouter → Créer une application MCP.
2. Nom : robot-seo-bug-gl.
3. Connexion : Tunnel.
4. Tunnel : robot-seo-bug-gl.
5. Authentification : Sans authentification.
6. Cocher l'avertissement puis créer.
7. Tester ensuite l'accès réel aux outils du connecteur, en priorité reprendre_robot.
8. Ne déclarer la continuité terminée qu'après test entre deux conversations avec le même journal privé.

Ne pas réutiliser le tunnel GuestLucky existant. Aucun secret n'est stocké ici.
