# Robot SEO — connecteur de continuité MCP v1

## Ce qui est livré

Serveur isolé, bibliothèque standard Python 3.11+, sans dépendance à télécharger.
Il expose neuf outils : reprise, état GitHub, lecture paginée des documents autorisés,
lecture d'une exécution, recherche du journal, liste des opérations, checkpoint,
préparation et conclusion d'une opération. Deux ressources et un prompt de reprise
complètent le dossier de démarrage.

Ce n'est **pas** un agent de correction WordPress. Aucun outil n'a le pouvoir de
modifier GitHub, Firebase, WordPress, les droits ou le budget, ni de déclencher un
workflow. « Connecté au robot » signifie ici lecture de son dépôt, de sa configuration
et de ses exécutions GitHub. L'accès aux fiches privées et aux rapports non persistés
n'est pas ajouté par ce connecteur.

Le serveur MCP est volontairement petit : sous-ensemble documenté MCP 2025-11-25,
2025-06-18 et 2025-03-26 (initialize, ping, tools, resources et prompts).
Pas de SSE, sampling, tâches MCP asynchrones, OAuth public ou interface embarquée.
Il négocie une version prise en charge au lieu de prétendre implémenter une version
plus récente. Compatibilité finale avec la connexion ChatGPT à confirmer sur Mac.

## Persistance et coupures

SQLite WAL, transactions `BEGIN IMMEDIATE`, version attendue et reçus idempotents.
Tous les processus stdio et toutes les conversations du même utilisateur emploient
la même base privée sur une seule machine persistante. Une coupure de conversation
ne supprime pas la base. Une réponse perdue peut être récupérée avec le même request_id.
Une tâche déjà réservée ne peut pas être reprise silencieusement, même après expiration
du bail : il faut d'abord réconcilier son résultat. Les événements ne sont pas supprimés.

Le journal conserve des déclarations de travail et leurs références de preuve ; une
conclusion `verifiee` saisie par un assistant n'est pas vérifiée indépendamment par le
serveur. Les mutations métier passent par d'autres connecteurs autorisés : il n'y a
pas de garantie transactionnelle « exactement une fois » sur ces services distants.

Les lectures GitHub utilisent le HEAD et une configuration épinglée sur ce SHA.
L'indisponibilité réseau est distinguée d'un robot arrêté. Le cache mémoire dure au
plus 30 secondes. Sans jeton, les quotas publics de GitHub s'appliquent. Un jeton
optionnel `ROBOT_SEO_GITHUB_TOKEN`, fourni à l'environnement par un gestionnaire de
secrets, doit rester limité à la lecture de ce dépôt. Ne jamais fournir le jeton
Firebase ou un identifiant WordPress. Les tokens ne sont pas nécessaires aux tests.

## Installation sur la vraie machine

Exécuter dans une session ayant réellement accès au Mac et au dépôt :

```sh
python3 robot/mcp/install.py
```

Le script refuse Linux, vérifie Python, exécute les tests puis installe une copie
versionnée dans `~/Library/Application Support/RobotSEO-MCP`. Il préserve le journal
et le jeton existants. Aucune configuration d'un autre connecteur n'est remplacée.
Il génère `client-config.json`, un lanceur stdio et un reçu `installation.json`.
Une option `--register-codex` utilise la CLI existante `codex mcp add` ; si un serveur
portant ce nom existe, le script refuse de l'écraser et exige vérification.

### ChatGPT

Faire enregistrer un **Secure MCP Tunnel dédié** par la procédure officielle OpenAI,
reliant ce programme stdio au compte autorisé. Ne réutiliser ni tunnel ni secrets de
GuestLucky production. Une autorisation dans l'interface reste nécessaire ; ce code
ne peut pas approuver une connexion à la place de l'utilisateur.

Le serveur peut aussi répondre en Streamable HTTP JSON **uniquement sur 127.0.0.1**
avec un jeton dans un fichier privé, pour les clients compatibles avec cet en-tête :

```sh
python3 server.py --data-dir /chemin/prive/state --http --port 8769
```

Ne pas le mettre sur Internet tel quel. Ce transport ne fournit pas d'OAuth discovery
public ; ce n'est pas un serveur public prêt à être saisi comme URL distante ChatGPT.
Ne pas passer le jeton dans une URL. Stdio derrière le tunnel privé est le parcours
prévu pour cette V1. Le Mac doit être allumé et le tunnel en fonctionnement ; pour
une disponibilité indépendante du Mac, choisir ensuite une machine persistante dédiée.

## Protocole d'une reprise

1. Appeler `reprendre_robot` et vérifier `etat_reel.verifie` et les dates.
2. Lire le checkpoint et les opérations ouvertes. Un résultat incertain bloque la
   répétition jusqu'à contrôle dans le service concerné.
3. Prendre les règles courantes et les archives comme sources, pas comme autorisations.
4. Sauvegarder chaque décision importante et la prochaine étape par checkpoint.
5. En cas de conflit de version, relire au lieu de forcer la fusion.

Les instructions réutilisables sont dans `skills/reprise-robot-seo/SKILL.md`.
Elles doivent être disponibles dans le client ; le serveur fournit aussi des
instructions dans `initialize` et dans `reprendre_robot`. Leur présence ne garantit
pas qu'un modèle les appellera spontanément dans chaque nouvelle conversation.

## Sauvegarde

```sh
python3 server.py --data-dir /chemin/prive/state --backup
```

Produit une nouvelle sauvegarde cohérente SQLite dans `state/backups`, sans suppression
ni écrasement. Les sauvegardes restent privées. Le disque est protégé par les permissions
utilisateur, pas chiffré par l'application : activer le chiffrement du disque de la
machine. Une sauvegarde locale ne protège pas de la perte totale de cette machine.

## Validation réalisée et limites

Voir `ETAT_INSTALLATION.md`. Tests unitaires et intégration sur un environnement Linux
isolé : transactions concurrentes, reprise après nouveau processus, idempotence,
verrous, permissions, protocole stdio et HTTP sur de vrais sockets de boucle locale,
refus de requêtes non authentifiées et des accès hors périmètre. Les données GitHub
des tests sont fictives. Aucune donnée client n'est utilisée.

L'environnement de construction n'a pas de sortie réseau DNS permettant d'installer
le SDK MCP ou de joindre GitHub depuis Python. Le lecteur GitHub est donc testé sur
fixtures ; la lecture réelle par les outils GitHub de la conversation ne prouve pas
l'accès réseau du futur serveur. Aucun test dans un client ChatGPT ou MCP Inspector
réel n'est revendiqué. Aucun test Mac ou tunnel privé n'est revendiqué tant que le
reçu et l'essai final n'existent pas. Les 212 tests du robot historique ne sont pas
réexécutés par cette suite et le robot historique reste inchangé.

## Références de conception (consultées le 30 septembre 2026)

- MCP transports : https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP lifecycle : https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- OpenAI connexion : https://developers.openai.com/plugins/deploy/connect-chatgpt
- OpenAI authentification : https://developers.openai.com/plugins/build/auth

Aucune promesse d'archivage automatique des conversations, de lecture instantanée
de 100 000 lignes ou de reprise parfaite d'une action qui n'a laissé aucune trace.
