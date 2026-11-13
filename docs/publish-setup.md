# Publish setup

The Publish dialog (Phase 17, `src/features/publish`) works in every build with no setup. It makes a copy for each platform, a WordPress import file for a site of the writer's own, and Markdown for Markdown editors.

One part needs a value at build time: **Save as a draft on WordPress.com**. WordPress.com has a free API that a browser can call. Without an app id, the dialog leaves this button out.

## Make the WordPress.com app

1. Sign in at https://developer.wordpress.com/apps/ with the WordPress.com account of the project.
2. Choose Create New Application.
3. Name: Vlo. Description: a writing app. Website URL: the address of the Vlo site.
4. Redirect URLs: the address of the Vlo site, then `/wpcom-callback.html`, for example `https://vlo.example.com/wpcom-callback.html`. Add one line for each address that serves Vlo, such as a preview address.
5. Type: Web. Save the app.
6. Copy the Client ID. It is a number, and it is public.

The client secret stays unused: the app uses the implicit flow, so the browser gets the token straight from WordPress.com. Never put the secret in this repository or in a build value.

## Give the build the app id

Set `VITE_WPCOM_CLIENT_ID` to the Client ID in the build settings (on Vercel: Project, Settings, Environment Variables), then build again. `.env.example` lists it.

## What happens

1. The writer chooses Publish, then WordPress, then Save as a draft on WordPress.com.
2. A new window opens at `public-api.wordpress.com/oauth2/authorize`. The writer signs in and picks one site.
3. WordPress.com sends the window to `/wpcom-callback.html` with the token in the address fragment. The fragment never goes to a server. The page sends it to the Vlo tab on a BroadcastChannel (the Cross-Origin-Opener-Policy of Vlo cuts the link between the two windows) and closes.
4. Vlo checks the `state` value, keeps the token in the tab's memory, and posts the draft to `public-api.wordpress.com/rest/v1.1/sites/<site>/posts/new` with `status: draft`.
5. The network log records the request with the purpose `publish`. The privacy page has the entry "Drafts on WordPress.com".

A self-hosted WordPress site or a Ghost site has its own host. The CSP cannot list a host that each writer picks, so those sites get the import file and the copies.
