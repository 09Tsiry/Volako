# Activer la synchronisation Volako

La synchronisation nécessite un projet Supabase. GitHub Pages continue d'héberger l'application, tandis que Supabase conserve la copie partagée du foyer.

## 1. Créer le projet Supabase

1. Ouvrez https://supabase.com et créez un compte.
2. Créez un nouveau projet.
3. Choisissez un mot de passe solide pour la base.
4. Attendez que le projet soit prêt.

## 2. Créer la base sécurisée

1. Dans Supabase, ouvrez **SQL Editor**.
2. Cliquez sur **New query**.
3. Copiez tout le contenu du fichier `SUPABASE-SETUP.sql`.
4. Collez-le dans l'éditeur puis cliquez sur **Run**.

Ce script crée les foyers, les membres, le portefeuille partagé, la synchronisation temps réel et les règles de sécurité RLS.

## 3. Récupérer les deux informations publiques

Dans Supabase, ouvrez **Project Settings > API** et copiez :

- **Project URL** ;
- la clé publique **anon** ou **publishable**.

N'utilisez jamais la clé `service_role` dans Volako.

## 4. Configurer Volako une seule fois

Ouvrez le fichier `sync-config.js` et remplacez les valeurs vides :

```js
window.VOLAKO_SYNC_CONFIG={
  url:'https://VOTRE-PROJET.supabase.co',
  anonKey:'VOTRE-CLE-PUBLIQUE'
};
```

Vous pouvez modifier ce fichier directement sur GitHub avec le bouton crayon. Les deux utilisateurs n'auront alors pas besoin de saisir ces informations.

## 5. Autoriser l'adresse GitHub Pages

Dans Supabase, ouvrez **Authentication > URL Configuration** :

- définissez **Site URL** sur `https://09tsiry.github.io/Volako/` ;
- ajoutez la même adresse dans **Redirect URLs**.

## 6. Mettre GitHub Pages à jour

Envoyez tous les fichiers de `Volako-GitHub-Pages.zip` dans le dépôt GitHub en remplaçant les anciens fichiers. Vérifiez que `index.html` reste à la racine.

## 7. Premier utilisateur

1. Ouvrez Volako > **Paramètres > Synchronisation**.
2. Créez un compte avec votre adresse e-mail.
3. Confirmez l'e-mail si Supabase le demande.
4. Connectez-vous.
5. Créez un foyer, par exemple « Famille Tsiry ».
6. Copiez le code d'invitation affiché.

## 8. Deuxième utilisateur

1. Ouvrez la même adresse Volako sur son téléphone.
2. Créez un autre compte avec son propre e-mail.
3. Connectez-vous et choisissez **Rejoindre avec un code**.
4. Saisissez le code du premier utilisateur.

Les deux téléphones utilisent alors le même portefeuille. Chaque téléphone conserve son thème, sa langue, son PIN et son délai de verrouillage.

## Précautions

- Exportez une sauvegarde JSON avant de rejoindre un foyer existant.
- En cas de modifications exactement simultanées, Volako conserve la version reçue la plus récente et avertit l'autre appareil.
- La synchronisation nécessite Internet, mais les fonctions locales restent disponibles hors ligne.
