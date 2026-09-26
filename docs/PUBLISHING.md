# Publishing Star Tracker

1. Create a public GitHub repo named `star-tracker` and push this folder to it.
2. Set `authorUrl` in `manifest.json` (your GitHub profile or site) if you want one.
3. Tag and push the first release. The tag must match `manifest.json` exactly, with no `v`:
   ```bash
   git tag 1.0.0
   git push origin 1.0.0
   ```
   The GitHub Action builds and creates a **draft** release with `main.js`, `manifest.json` and `styles.css`. Open it on GitHub and click Publish.
4. Fork https://github.com/obsidianmd/obsidian-releases and add the entry in `docs/obsidian-releases-entry.json` to the end of `community-plugins.json`. Replace `YOUR-GITHUB-USERNAME`.
5. Open a pull request with the title `Add plugin: Star Tracker` and fill in the checklist. The review bot checks the manifest and release. A human review follows.

For later versions: `npm version patch` (updates manifest.json and versions.json), push the commit and tag.
