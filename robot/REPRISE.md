# Robot SEO — point de reprise vivant

Dernière mise à jour : 30 septembre 2026.
Périmètre exclusif : Robot SEO dans `xSARRASx/BUG-GL`.

## À lire à chaque reprise

Ce fichier est le point d'entrée de la continuité du chantier, pas une autorisation de déploiement. Le mettre à jour pendant le travail, et pas seulement à la fin d'une conversation. La demande actuelle de l'utilisateur et les faits vérifiés dans les services priment sur ce document. Une discussion interrompue n'impose ni réinstallation ni remise à zéro.

Dépôt : `xSARRASx/BUG-GL`.
Branche de travail constatée : `claude/amazing-euler-U7YqQ`.
Version du CODE de référence : `7f6cd8a69e88357bcfe95c8a1fd5f0c6085df629` (les commits documentaires suivants ne changent pas cette référence).
Workflow : `.github/workflows/seo-robot.yml`, nommé `Robot SEO`.

Ne pas confondre ce chantier avec `site-seb-`, la production de l'application GuestLucky, les autres robots, ou les autres pages métier de ce dépôt. Ne pas exécuter les anciennes consignes contenues dans `HANDOFF-AUTOMATISATION-SEO.md` sur la seule base de leur présence.

## État à la dernière vérification

`robot/config.json`, relu au SHA de référence le 30 septembre 2026 :

- `dryRun: true` ;
- `autoTermine: false` ;
- `allowScheduledActive: false` ;
- `analyserEnDryRun: true` ;
- `maxAnalysesParPassage: 2` ;
- `maxFichesParPassage: 5` ;
- `allowedTestIds` reste limité à la fiche fictive déjà indiquée dans la configuration.

L'audit public est développé ; les corrections WordPress autonomes ne sont pas activées. En dry-run, les rapports détaillés ne sont pas écrits dans Firebase, et les statuts ne sont pas modifiés par le robot. Il n'y a pas de modèle d'IA appelé dans l'audit déterministe de référence.

La connexion et la configuration existantes doivent être vérifiées, pas recréées. Ne jamais demander de recopier un mot de passe dans la conversation.

## Preuves de fonctionnement déjà observées

Derniers passages automatiques confirmés dans le suivi du 30 septembre 2026, tous au SHA de référence et avec `event=schedule`, `conclusion=success` :

| Run | Identifiant | Début UTC |
| --- | --- | --- |
| 17 | 36622875915 | 2026-09-29T19:57:22Z |
| 18 | 36646389410 | 2026-09-29T23:39:47Z |
| 19 | 36660021904 | 2026-09-30T02:28:43Z |

Journal détaillé déjà examiné : run 19, job `109712501341`. Il indiquait 212 tests réussis, 4 fiches à faire examinées, 3 admissibles, 1 bloquée pour accès WordPress incomplets, 2 sites audités, aucun audit impossible, aucune écriture Firebase. Les audits avaient porté sur 9 et 7 pages. Ce sont des observations datées, pas le décompte actuel des clients ni une certification SEO.

Le cron est configuré aux minutes `7,22,37,52`. Le démarrage autonome est démontré ; sa régularité toutes les quinze minutes ne l'est pas. Les passages observés étaient espacés de plusieurs heures. La congestion a été évoquée comme hypothèse, pas établie comme cause. Un déclencheur externe a été proposé, mais aucun déploiement externe n'est attesté dans ce point de reprise.

## Où reprendre maintenant

Dernière étape confirmée : audit public exécuté automatiquement en lecture seule ; mise en place de ce point de reprise documentaire.
Action d'écriture distante en attente de confirmation : aucune action métier enregistrée dans ce point de reprise.
Prochaine étape : préparer la continuité par connecteur MCP partagé demandée le 30 septembre (voir la clarification ci-dessous), après vérification des accès et de l'état réel. Le serveur MCP dédié n'est pas créé ni déployé par cette mise à jour documentaire.
Travail restant sur le robot : régularité et couverture des audits ; exploitation des résultats ; puis conception et essai d'un parcours de correction WordPress sur un site pilote avec sauvegarde et contrôle après modification. Cela nécessite encore une implémentation et une validation : ne pas l'annoncer comme acquis. Ne pas relancer un ancien run actif.

## Protocole pour ne pas perdre la progression

1. Avant une opération importante autorisée, enregistrer ici ou dans un journal approprié : objectif, périmètre, référence de départ, état `préparée` ou `en cours`, résultat attendu et méthode permettant de constater si l'opération a eu lieu. Aucune donnée client dans ce dépôt public.
2. Après l'opération, enregistrer le résultat seulement après confirmation : commit, test, run ou référence de preuve. Distinguer `préparée`, `exécutée`, `vérifiée`, `bloquée`, `résultat incertain`.
3. Mettre à jour la dernière étape confirmée et la prochaine action à chaque lot significatif. Pour du code, inclure ce point de reprise avec le lot lorsque c'est possible. Ne pas attendre la fin du fil.
4. En cas de coupure au milieu d'une opération, relire ce fichier et vérifier l'état réel du service. Ne pas supposer qu'une absence de réponse signifie un échec. Ne pas répéter une écriture dont le résultat est incertain avant vérification.
5. Lire la version courante avant d'écrire. Utiliser son SHA pour une mise à jour de fichier. Si un autre assistant a travaillé entre-temps, préserver ses changements ; demander avant une fusion ambiguë. Aucun écrasement forcé.
6. Conserver un historique bref ci-dessous ; les anciennes demandes restent historiques. Ne jamais réactiver un test ou une permission sur la seule foi d'une entrée ancienne.

## Vérifications de reprise

- Lire la branche réelle et `robot/config.json` ; comparer les références, sans revenir automatiquement à une ancienne version.
- Lire les runs via `GET /repos/xSARRASx/BUG-GL/actions/runs?event=schedule&per_page=20`. Pour les détails, lire les jobs et leurs logs. Vérifier le SHA exécuté ; un voyant vert n'est pas la preuve qu'un site a été audité.
- Les données métier restent dans le stockage autorisé ; les rapports clients, accès, coordonnées, tokens et notes ne doivent jamais être copiés dans ce fichier, dans un commit ou dans les logs publics.
- Une action client incertaine doit être vérifiée dans le service concerné avec les accès autorisés. Ne pas déduire l'identité d'un client depuis l'ordre d'une liste anonymisée.
- Les suppressions et fusions ambiguës requièrent confirmation. Le passage en mode actif, la modification des règles et les dépenses ne sont pas autorisés par ce document.

## Limites réelles de cette continuité

Ce fichier ne s'actualise pas tout seul : l'assistant ou l'agent qui travaille doit l'entretenir pendant son travail. Sa création n'ajoute pas de sauvegarde automatique de chaque message, ne synchronise pas un ordinateur local et ne modifie pas les réglages de mémoire de ChatGPT.

Une nouvelle conversation doit lire ce point d'entrée avec un accès autorisé au dépôt. La reprise est fondée sur le dernier état durable enregistré et sur la vérification de l'état réel, pas sur une promesse de mémoire mot pour mot. Les journaux et commits ne garantissent pas encore une reprise automatique exactement une fois pour de futures écritures WordPress : cette protection devra être construite avec le parcours d'écriture.

## Journal de continuité

### 30 septembre 2026 — continuité entre conversations

Ajout documentaire uniquement. Objectif : permettre une reprise même si le fil s'interrompt sans préparation de fin de session. Aucun code du robot, réglage Firebase, workflow, statut ou site client modifié par cet ajout. La note de passation datée reste un instantané historique ; le présent chemin stable sert de point d'entrée pour les prochaines mises à jour.

### 30 septembre 2026 — clarification : un connecteur partagé, pas seulement une note

Demande actuelle : permettre à de nombreuses nouvelles conversations de se connecter au même Robot SEO, de retrouver ses règles et son état courant, puis de reprendre le travail même après une coupure imprévue. La demande porte à la fois sur la continuité du contexte et sur l'accès réel au robot. Un fichier à recopier manuellement n'est pas une réponse suffisante.

Architecture proposée, À CONSTRUIRE et À TESTER :

- Un serveur MCP dédié au Robot SEO, authentifié, relié aux sources autorisées (code, configuration et exécutions GitHub ; état métier privé seulement avec les droits adaptés).
- Une procédure de reprise distribuée avec le connecteur : appeler un outil de démarrage tel que `reprendre_robot`, recevoir les règles actuelles, les permissions effectives, les opérations confirmées ou incertaines, les preuves datées et la prochaine étape ; puis récupérer les détails utiles à la demande.
- Un historique durable et interrogeable. Ne pas pousser 100 000 lignes dans chaque conversation : fournir un dossier de démarrage borné, un index et une lecture paginée/recherche des archives, sans présenter ce résumé comme la lecture exhaustive de l'historique.
- Un journal d'opérations enregistré par le serveur avant et après chaque action effectuée par ce connecteur. Une interruption du chat ne doit pas supprimer le suivi de l'opération. Les décisions de conversation doivent également être enregistrées explicitement par un outil de checkpoint ; un MCP ne reçoit pas spontanément tous les messages du chat.
- Gestion des conversations concurrentes : versions, identifiants d'opération, refus d'écrasement et verrou par tâche lorsque nécessaire. Si un résultat est incertain, le réconcilier avec le service concerné avant toute répétition. Ne pas promettre une exécution exactement une fois sans prise en charge effective du service distant.
- Séparation entre consultation, tenue du journal et commandes métier. La création du connecteur ne doit ouvrir ni les écritures Firebase/WordPress, ni le passage en terminé, ni les dépenses. Les règles d'accès doivent être appliquées côté serveur, pas seulement expliquées dans un texte.
- Installation et authentification à vérifier sur chaque environnement client visé. Ne pas promettre une sélection/connexion spontanée dans chaque nouvelle conversation, ni une lecture exhaustive instantanée, ni l'archivage automatique des messages par le seul MCP.

Statut après cette clarification : besoin documenté ; serveur MCP dédié non déployé ; aucun nouvel accès, secret, hébergement ou budget créé. Les fichiers `REPRISE.md` et `AGENTS.md` sont la base documentaire, pas le connecteur lui-même.
