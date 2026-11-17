# Backdrop photographs

The scenes around the page (`src/features/scenes`) and the atmospheres behind the app
(`src/styles/atmospheres.css`) use these photographs. Each one comes from Unsplash, under the
[Unsplash License](https://unsplash.com/license): free to use and change, with no permission needed.
Vlo names the photographers here to thank them.

The browser fetches a photograph only when its scene or atmosphere shows, and the service worker keeps it
for offline use. Each `-thumb` file is a small copy for the pickers.

| File             | Photograph                                                                                                                          | Photographer     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| scene-rain       | [Raindrops on a window, city lights](https://unsplash.com/photos/a-rain-streaked-window-with-a-bokeh-effect-Imvn4PWHPcQ)            | freestocks       |
| scene-fireplace  | [A close up of a fire in the dark](https://unsplash.com/photos/a-close-up-of-a-fire-in-the-dark-DZojRxyG-Sw)                        | Elisabeth Arnold |
| scene-night      | [Silhouette of trees under the Milky Way](https://unsplash.com/photos/OkmTqOduDGE)                                                  | Nicola Nuttall   |
| scene-forest     | [Misty forest at dawn](https://unsplash.com/photos/misty-forest-landscape-at-dawn-with-silhouetted-trees-7S2OffSbC0s)               | T (@tanyabarrow) |
| scene-snow       | [A cabin in the snow, seen through a window](https://unsplash.com/photos/a-cabin-in-the-snow-seen-through-a-window-ivGTMYRw2pI)     | Lukas Seitz      |
| scene-ocean      | [The sun setting over the ocean](https://unsplash.com/photos/the-sun-is-setting-over-the-ocean-on-the-beach-l2XFbYwsEbk)            | Bernd Dittrich   |
| atmo-forest      | [A foggy forest](https://unsplash.com/photos/a-foggy-forest-filled-with-lots-of-trees-YUbuINKyqhY)                                  | Tim Mossholder   |
| atmo-galaxy      | [The Milky Way above a dark rock](https://unsplash.com/photos/milky-way-galaxy-above-a-dark-silhouetted-rock-formation-MRl02VYm-Tg) | Dennis Zhang     |
| atmo-deep-sea    | [Sunlight on the deep ocean floor](https://unsplash.com/photos/shimmering-sunlight-on-deep-ocean-floor-3o5oUjrD90w)                 | Jonathan Borba   |
| atmo-candlelight | [Lit candles in a dark room](https://unsplash.com/photos/a-group-of-lit-candles-in-a-dark-room-Kh1g6kKUSlY)                         | Meizhi Lang      |
| atmo-wonderland  | [Wisteria in a forest](https://unsplash.com/photos/purple-flowers-in-forest-during-daytime-qaoHG7MLV-0)                             | Aki              |
| atmo-blossom     | [A branch with pink flowers](https://unsplash.com/photos/a-branch-of-a-tree-with-pink-flowers-lCjH6ZOBhXs)                          | simon            |
| atmo-frost       | [Ice crystals on a window](https://unsplash.com/photos/a-close-up-of-ice-crystals-on-a-window-HRP_hTutMB0)                          | Eugene Golovesov |

## How the files were made

Each photograph was cropped to 3:2 (scenes, 1920 × 1280) or 16:10 (atmospheres, 2400 × 1500) and saved as
WebP at quality 60. Some photographs are softened so text over them stays easy to read: a Gaussian blur of
4 px for the fireplace (which is also darkened to 72%), 3 px for frost, 2 px for wisteria and candlelight,
and 1.5 px for the deep sea. Each `-thumb` file is at most 480 × 300, at quality 64.
