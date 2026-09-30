# Robot SEO — point de reprise vivant

Dernière mise à jour : 30 septembre 2026.
Périmètre exclusif : Robot SEO dans `xSARRASx/BUG-GL`.

## DERNIER CHECKPOINT CONFIRMÉ — Mac installé, création du tunnel en cours

Ce bloc est prioritaire sur les états historiques plus bas.

Le 30 septembre 2026, Martin a installé la V1 du connecteur sur son vrai Mac depuis `/Users/more/BUG-GL` avec :

`python3 robot/mcp/install.py`

Preuves copiées depuis le Terminal :
- 75 tests MCP réussis en 6,988 s ;
- `installe_sur_mac: true` ;
- `version_source: cce238d41d5f341e` ;
- journal privé : `/Users/more/Library/Application Support/RobotSEO-MCP/state` ;
- configuration client : `/Users/more/Library/Application Support/RobotSEO-MCP/client-config.json` ;
- sauvegarde SQLite créée par l'installateur ;
- `enregistre_codex: false` ;
- `connecte_chatgpt: false` ;
- `tunnel_securise_installe: false` ;
- `aucun_site_modifie: true`.

Dans ChatGPT, Martin a confirmé que l'interface Plugins permet `Ajouter → Créer une application MCP`. La fenêtre de création accepte une connexion `Tunnel`.

Dans OpenAI Platform, `Organization settings → Tunnels` est accessible. Un ancien tunnel nommé `guestlucky-code-prod-lecture-seule` existe déjà : **ne pas le réutiliser ni le modifier** pour le Robot SEO.

État exact au moment du checkpoint :
- la fenêtre ChatGPT `Nouveau plugin` est ouverte ;
- nom saisi : `robot-seo-bug-gl` ;
- connexion sélectionnée : `Tunnel` ;
- le champ tunnel Robot SEO n'est pas encore rempli ;
- seul l'ancien tunnel GuestLucky est visible dans les suggestions ;
- la case d'avertissement `Je comprends et souhaite continuer` est cochée ;
- le menu Authentification est ouvert et affiche `OAuth`, `Sans authentification`, `OAuth ou sans authentification`;
- **ne pas cliquer Créer tant qu'un tunnel Robot SEO dédié n'a pas été créé et relié au tunnel-client du Mac**.

Choix d'authentification prévu pour cette V1 : `Sans authentification` côté application MCP. Le serveur V1 n'implémente pas OAuth utilisateur ; l'authentification du transport OpenAI ↔ tunnel-client est séparée. Ne pas sélectionner OAuth par défaut en prétendant qu'il est pris en charge.

Prochaine action exacte :
1. Dans la fenêtre ChatGPT actuelle, choisir `Sans authentification`, puis ne pas cliquer `Créer`.
2. Revenir dans OpenAI Platform → Organization settings → Tunnels.
3. Cliquer `Créer un tunnel` et créer un tunnel **dédié** nommé `robot-seo-bug-gl`, associé au contexte personnel/ChatGPT approprié. Ne toucher à aucun tunnel GuestLucky existant.
4. Installer/initialiser `tunnel-client` sur le Mac avec ce nouveau `tunnel_id` et la commande stdio du serveur installé ; conserver toute clé API/runtime hors du chat.
5. Exécuter `tunnel-client doctor --profile <profil> --explain`, puis `tunnel-client run --profile <profil>` et vérifier qu'il est ready.
6. Revenir dans ChatGPT, sélectionner/coller le nouveau `tunnel_id`, garder `Sans authentification`, créer l'application puis tester `reprendre_robot`.
7. Tester ensuite deux nouvelles conversations avec le même `journal_id` et un checkpoint fictif avant de dire « terminé ».

Ne pas générer ou coller de token dans la conversation. Ne pas réutiliser l'ancien tunnel GuestLucky. Ne pas modifier Firebase, WordPress, les statuts, le workflow ou un budget pendant ce branchement.

## Dernier point confirmé — connecteur MCP construit, installation restante

Cette entrée est historique : l'installation Mac a depuis été effectuée, voir le checkpoint ci-dessus.

Cette entrée complète et actualise les états historiques ci-dessous. À la demande actuelle de Martin de réaliser le connecteur, le serveur et son paquet d'installation ont été créés dans `robot/mcp/`. **75 tests ont réussi dans l'environnement Linux isolé** : journal durable, reprise après redémarrage, concurrence, idempotence et transports MCP locaux. Le code et les tests ont été enregistrés dans GitHub et leurs blobs ont été comparés aux fichiers testés.

Lire en priorité `robot/mcp/ETAT_INSTALLATION.md` pour les preuves, les limites et la procédure restante, puis `robot/mcp/README.md`.

Le MCP V1 permet la consultation GitHub du Robot SEO et la tenue d'un journal privé sur sa machine hôte. Il n'expose aucune écriture GitHub/Firebase/WordPress et aucun déclenchement de workflow. Aucun service payant ou infrastructure d'un autre projet n'a été activé. Le code, la configuration et le workflow du robot historique restent inchangés par ce chantier.

## Vérification du 30 septembre 2026 — installation toujours impossible depuis un conteneur

Historique : une session cloud a tenté de mener l'installation jusqu'au bout et a confirmé que son environnement Linux isolé n'était pas le Mac. Au HEAD `462e7c1` : 75 tests MCP réussis, 212 tests du robot historique réussis, et `install.py --register-codex` refusé comme prévu hors Mac. Ce bloc est désormais dépassé pour l'installation elle-même, puisque Martin a ensuite exécuté l'installateur sur son Mac.

## À lire à chaque reprise

Ce fichier est le point d'entrée de la continuité du chantier, pas une autorisation de déploiement. Le mettre à jour pendant le travail, et pas seulement à la fin d'une conversation. La demande actuelle de l'utilisateur et les faits vérifiés dans les services priment sur ce document. Une discussion interrompue n'impose ni réinstallation ni remise à zéro.

Dépôt : `xSARRASx/BUG-GL`.
Branche de travail constatée : `claude/amazing-euler-U7YqQ`.
Version du CODE du robot historique de référence : `7f6cd8a69e88357bcfe95c8a1fd5f0c6085df629` (les commits documentaires et le nouveau dossier `robot/mcp` ne changent pas ce code historique).
Workflow : `.github/workflows/seo-robot.yml`, nommé `Robot SEO`.

Ne pas confondre ce chantier avec `site-seb-`, la production de l'application GuestLucky, les autres robots, ou les autres pages métier de ce dépôt. Ne pas exécuter les anciennes consignes contenues dans `HANDOFF-AUTOMATISATION-SEO.md` sur la seule base de leur présence.

## État à la dernière vérification du robot historique

`robot/config.json`, relu au SHA de référence le 30 septembre 2026 :
- `dryRun: true` ;
- `autoTermine: false` ;
- `allowScheduledActive: false` ;
- `analyserEnDryRun: true` ;
- `maxAnalysesParPassage: 2` ;
- `maxFichesParPassage: 5` ;
- `allowedTestIds` reste limité à la fiche fictive déjà indiquée dans la configuration.

L'audit public est développé ; les corrections WordPress autonomes ne sont pas activées. En dry-run, les rapports détaillés ne sont pas écrits dans Firebase, et les statuts ne sont pas modifiés par le robot. Il n'y a pas de modèle d'IA appelé dans l'audit déterministe de référence.

## Preuves de fonctionnement déjà observées

Derniers passages automatiques confirmés dans le suivi du 30 septembre 2026, tous au SHA de référence et avec `event=schedule`, `conclusion=success` :

| Run | Identifiant | Début UTC |
| --- | --- | --- |
| 17 | 36622875915 | 2026-09-29T19:57:22Z |
| 18 | 36646389410 | 2026-09-29T23:39:47Z |
| 19 | 36660021904 | 2026-09-30T02:28:43Z |

Journal détaillé déjà examiné : run 19, job `109712501341`. Il indiquait 212 tests réussis, 4 fiches à faire examinées, 3 admissibles, 1 bloquée pour accès WordPress incomplets, 2 sites audités, aucun audit impossible, aucune écriture Firebase. Les audits avaient porté sur 9 et 7 pages. Ce sont des observations datées, pas le décompte actuel des clients ni une certification SEO.

Le cron est configuré aux minutes `7,22,37,52`. Le démarrage autonome est démontré ; sa régularité toutes les quinze minutes ne l'est pas. Les passages observés étaient espacés de plusieurs heures. La congestion a été évoquée comme hypothèse, pas établie comme cause.

## Protocole pour ne pas perdre la progression

1. Avant une opération importante autorisée, enregistrer ici ou dans un journal approprié : objectif, périmètre, référence de départ, état `préparée` ou `en cours`, résultat attendu et méthode permettant de constater si l'opération a eu lieu. Aucune donnée client dans ce dépôt public.
2. Après l'opération, enregistrer le résultat seulement après confirmation : commit, test, run ou référence de preuve. Distinguer `préparée`, `exécutée`, `vérifiée`, `bloquée`, `résultat incertain`.
3. Mettre à jour la dernière étape confirmée et la prochaine action à chaque lot significatif. Ne pas attendre la fin du fil.
4. En cas de coupure au milieu d'une opération, relire ce fichier et vérifier l'état réel du service. Ne pas supposer qu'une absence de réponse signifie un échec.
5. Lire la version courante avant d'écrire. Si un autre assistant a travaillé entre-temps, préserver ses changements ; demander avant une fusion ambiguë. Aucun écrasement forcé.
6. Ne jamais réactiver un test ou une permission sur la seule foi d'une entrée ancienne.

## Limites réelles de cette continuité

Le journal MCP se partage entre les conversations qui appellent la même instance installée sur le Mac et la même base privée. Le Mac et le tunnel doivent rester disponibles. Le MCP ne reçoit pas spontanément tous les messages : l'agent doit enregistrer les décisions importantes par checkpoint.

Aucun site, statut, règle Firebase ou réglage du robot historique n'a été modifié par la mise en place du connecteur.


## 30 septembre 2026 — tunnel Robot SEO créé dans OpenAI Platform

Preuve visuelle fournie par Martin : dans OpenAI Platform → Organization settings → Tunnels, une nouvelle ligne `robot-seo-bug-gl` apparaît, séparée de `guestlucky-code-prod-lecture-seule`, associée à l'organisation Personal et au workspace ChatGPT personnel. Le tunnel dédié existe donc côté OpenAI Platform.

Le tunnel n'est pas encore relié au serveur local : `tunnel-client` reste à télécharger/configurer sur le Mac, puis à passer en état ready avant de créer le plugin ChatGPT. Ne pas déclarer le connecteur opérationnel avant ce test.

Prochaine action exacte : utiliser le bouton `Download tunnel-client` de la page Tunnels, installer/exécuter le client sur le Mac, configurer un profil local stdio avec le nouveau tunnel Robot SEO et la commande MCP installée, lancer `doctor`, puis `run`, vérifier ready, et seulement ensuite terminer la création du plugin ChatGPT avec `Sans authentification`.


## 30 septembre 2026 — téléchargement du client tunnel en cours

Martin est arrivé sur la release officielle `openai/tunnel-client v0.0.15` dans GitHub après avoir cliqué sur `Download tunnel-client` depuis OpenAI Platform. La page affiche les assets macOS arm64/amd64 et les variantes runtime.

Pour ce chantier, utiliser le **client complet** `tunnel-client-v0.0.15-darwin-arm64.zip`, pas `tunnel-client-runtime-cloudflared-...`, car la suite requiert les commandes d'administration/profil `init`, `doctor` et `run`. Le Mac de Martin est Apple Silicon (Homebrew sous `/opt/homebrew` observé plus tôt), donc `darwin-arm64`.

Étape suivante : télécharger le ZIP complet arm64, puis vérifier/installler le binaire sur le Mac avant de créer le profil `robot-seo-bug-gl`.


## 30 septembre 2026 — correction d'installation tunnel-client sur macOS

Le ZIP complet arm64 a bien été téléchargé et inspecté : il contient `tunnel-client` et `cloudflared`. Après vérification du README officiel `openai/tunnel-client` v0.0.15, le chemin **supporté sur macOS est Homebrew** :

`brew install openai/tools/tunnel-client`

Les ZIP de release ne sont pas notarifiés et peuvent être bloqués par Gatekeeper ; ne pas contourner avec `xattr`, `spctl` ou « Open Anyway ». Le ZIP téléchargé peut rester dans Downloads mais ne doit pas être utilisé pour installer manuellement le binaire.

Prochaine action : installer via Homebrew, puis vérifier `tunnel-client --version` et `tunnel-client help quickstart`. Ensuite créer une clé Runtime API restreinte Tunnels Read + Use et initialiser le profil stdio.


## 30 septembre 2026 — tunnel-client installé via Homebrew

Martin a exécuté sur son Mac :
- `brew install openai/tools/tunnel-client` ;
- Homebrew a confirmé `openai/tools/tunnel-client 0.0.14` déjà installé et à jour pour le tap ;
- `tunnel-client --version` → `0.0.14+0f870e50a973fa820d4c409000059e181e8d242b` ;
- `tunnel-client help quickstart` fonctionne et expose bien les parcours `init`, `doctor`, `run`, les Runtime API keys et le sample `sample_mcp_stdio_local`.

La release GitHub v0.0.15 existe mais le tap Homebrew supporté sert encore 0.0.14. Ne pas contourner Gatekeeper avec le ZIP ; utiliser la version Homebrew tant qu'elle fournit le parcours requis.

Prochaine étape exacte : créer une **Runtime API key** restreinte avec permissions Tunnels Read + Use depuis Organization settings → API keys. Ne pas utiliser une Admin key ni une clé All. Ne jamais coller la clé dans le chat. Ensuite initialiser le profil `robot-seo-bug-gl` avec le tunnel ID dédié et la commande stdio installée.
