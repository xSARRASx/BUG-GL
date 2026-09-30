# Installation du connecteur Robot SEO

Date : 30 septembre 2026. Départ du code : 7e2589fbd791d604f2cc44df7148f8ef5e989158.

Demande actuelle de Martin : réaliser le connecteur partagé, avec accès au robot et journal de reprise durable, sans réutiliser l'infrastructure des autres projets et sans activer de service payant.

## État

Construction en cours. Aucun connecteur MCP dédié n'est encore installé dans ChatGPT, aucun serveur MCP permanent n'est en service.

Le terminal accessible à l'assistant est un environnement Linux isolé, pas le Mac de Martin. Les actions Plugin Management exposées ne permettent pas d'installer une nouvelle connexion. L'unique projet Supabase visible concerne Leapway : il ne sera pas utilisé. Aucun accès de production GuestLucky n'est réutilisé.

## Livraison ciblée

Serveur MCP isolé dans robot/mcp : lecture GitHub bornée au Robot SEO, dossier de démarrage, journal SQLite privé hors dépôt, checkpoints versionnés et idempotents, suivi d'opérations et protection contre les reprises concurrentes, recherche paginée, sauvegarde. Stdio pour client local ou tunnel MCP sécurisé ; pas d'exposition publique non authentifiée. Scripts d'installation et tests fournis.

Aucun outil du connecteur ne modifiera Firebase, les sites WordPress, le workflow ou les permissions. Les écritures seront uniquement documentaires dans ce dépôt et dans le journal privé lorsqu'il sera installé.

## Ce qui reste à vérifier

Exécution des tests ; enregistrement du code ; installation sur une machine persistante dédiée ou le Mac ; connexion autorisée dans ChatGPT ; essai dans deux nouvelles conversations. Ne pas déclarer ces étapes terminées sans preuve.
