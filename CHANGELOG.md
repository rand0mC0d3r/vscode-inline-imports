# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased](https://github.com/rand0mC0d3r/vscode-inline-imports/compare/v0.0.9...HEAD)

## [v0.0.9](https://github.com/rand0mC0d3r/vscode-inline-imports/compare/0.0.8...v0.0.9) - 2025-11-06

### Commits

- refactor: streamline import resolution logic in analyzeFile function [`3ba9e8f`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/3ba9e8fffcefcb3992ba0a335c9814a516368af6)
- feat: enhance alias handling and improve logging for static and dynamic imports [`2db74df`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/2db74df4731974430d0b19b6deb2b0cb8a004b45)
- feat: update version to 0.0.8 in package.json; add LICENSE file with MIT License [`5df887f`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/5df887fd2697f7e76874a06fadaf6cea3bf52e13)
- chore: update publish script to include version bump before changelog generation [`ab7ca77`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/ab7ca778cb76e72d47162c89158eeb9e17f74914)
- feat: improve status bar update logic and enhance import resolution caching [`fba66ec`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/fba66ec39a7041726f3ad5a21e4fa843bac1480e)

## [0.0.8](https://github.com/rand0mC0d3r/vscode-inline-imports/compare/0.0.4...0.0.8) - 2025-11-06

### Commits

- chore: update package.json for version 0.0.7 and add changelog generation [`93c0aa6`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/93c0aa64a3d556985e947a3f21715076b978e715)
- feat: update README for improved feature clarity and add new command; bump version to 0.0.5 in package.json [`107a967`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/107a967141a089d550d592fa9d0c1f7d944d3ce9)

## 0.0.4 - 2025-11-06

### Commits

- feat: initialize VS Code extension with basic functionality and file decoration provider [`1cd2ae4`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/1cd2ae4c1e853ea2e17aa7bbb93cfcf2ad438073)
- feat: update dependencies and enhance workspace scanning functionality [`aa015c8`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/aa015c8292dcbc879a33ac1d781abc5d37973f8c)
- feat: refactor activate function to improve file scanning and configuration handling; add smartScanWorkspace for efficient import indexing [`6684c73`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/6684c73dc13bf7052d6704f1c169f88253ad1458)
- feat: implement import resolution logic by moving functionality to utils module [`5e5c6d7`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/5e5c6d7e2d3b61ad7c2575ecd1c977f60ff951a6)
- feat: refactor import scanning logic and enhance utility functions for better organization [`3a48987`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/3a4898712a4ec1932be4365411a6f21d6b8d8c65)
- feat: enhance import scanning functionality with improved error handling and modular structure [`e861f73`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/e861f73be09dcdc02274ac0f8d10b832160e5e12)
- Initial commit [`b503853`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/b5038538e7665f52fbad57f8de394e8f5df54b02)
- feat: update README to enhance feature descriptions and usage instructions; bump version to 0.0.4 in package.json [`c71198f`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/c71198f49ebd2534dd78073effcbe4809f90d2e5)
- feat: enhance import scanner with configurable options and improve file processing logic [`a90af46`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/a90af46f4081e22d7fc89b3b0e33cd9840a20e1b)
- feat: enhance import resolution with support for tsconfig path aliases and file existence checks [`79e2c64`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/79e2c64400f39cf277d009b90d1d54e92245866c)
- feat: refactor import resolution logic and enhance handling of dynamic imports [`79dce10`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/79dce10b49a25aad45ce0207a005cc56c1fde73e)
- feat: add configuration options for import scanner and improve file analysis logic [`c031b29`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/c031b29eb3c554a510bb061a41d47156ea2980cf)
- feat: update status bar item text and tooltip; refactor updateStatusBar function to interfaceElements module [`bcd6c1c`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/bcd6c1c8778b77bc618fec529f955aa0f280ae73)
- feat: add p-limit dependency, enhance file scanning performance, and improve badge display in decoration provider [`ee96f09`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/ee96f0905154950e6fb7339bbafbd31d178a9709)
- feat: add p-limit dependency and enhance workspace scanning with concurrent file analysis [`6ab6bd5`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/6ab6bd555ef526c267fe5b1ebacf8dedebf22a01)
- feat: enhance import resolution and add file existence check [`a6ded90`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/a6ded90b70c1f0e5197e61441f8168d9ec6cb33e)
- feat: add 'Show Actions' command to extension; implement unused files display functionality [`c31197e`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/c31197e00990dfc9873734f1b1a89d368621fcb2)
- feat: refactor extension to create actions menu and status bar item in separate module [`ad73371`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/ad73371e408241eb78ba5f8ddd975c9ca2fddbe3)
- feat: improve import resolution and error handling in tryResolve function [`a014058`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/a01405820acd54921b5b11a50228850a165a5df8)
- feat: update package.json version; refactor configuration properties and enhance status bar updates in extension [`62864a2`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/62864a21cef531b5cc77bca68378b76374c119f4)
- feat: enhance import resolution with index file fallbacks and support for dynamic imports [`574c940`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/574c940ab0ffda1bf3f78b991f46bf17a57329be)
- feat: streamline import resolution by consolidating alias handling into a single loop [`41af8e7`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/41af8e7c5b23118b645fd42fed4a1a1776fe45d8)
- Refactor code structure for improved readability and maintainability [`fdde9af`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/fdde9af3b8b597062879ec44b074ca7e6d489958)
- feat: update reindex command and adjust batch size for file scanning [`df6c424`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/df6c424894193139288a213f821ec22fd22c4a47)
- feat: move constants to a dedicated module for improved organization and maintainability [`5404d8e`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/5404d8ebf0279908bad915155de10d21b1bb5520)
- feat: streamline file scanning process and improve import resolution logging [`822419f`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/822419f8bef2d7235e79ca3213ad211450f8d894)
- feat: update constants and improve import resolution logging for better debugging [`287b0fd`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/287b0fda628169758d10121a7c8bfdb629979cb6)
- chore: clean up README by removing outdated release notes and guidelines [`639a115`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/639a1151863a1282e6b0172b52794750c77baf2f)
- feat: enhance import resolution for '@views/' and '@modules/' aliases and remove debug logging [`29ff3c1`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/29ff3c1daca90d9503c565f1be29503460ce5872)
- feat: update package.json with detailed display name and description; add delete icon configuration option [`0cd1514`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/0cd1514c6cd1f679247c9abc717f79b0db50e5cd)
- feat: improve file decoration provider with enhanced logging and configurable input patterns [`d753f3c`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/d753f3ccbf2d1ebfe80257714669d30ee33b632c)
- feat: enhance decoration provider to display badge and tooltip based on import count [`1bc732f`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/1bc732fbf8aaf6ba4d2e4c118e09e85bddfdc140)
- refactor: streamline file finding logic and improve formatting of compiler options [`11ea769`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/11ea7698b410c95a1317ef811620dff7957e4542)
- feat: enhance logging for import resolution with clearer messages [`e05c3e9`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/e05c3e922279c391f1a1413e14de23ec918f7efd)
- chore: update code structure and improve readability in utils.ts [`d5311e6`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/d5311e6688cc9557dae6b3a26c54237127b2df93)
- feat: enhance file decoration provider to skip folders and improve tooltip formatting [`32bc992`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/32bc9920c0bc8084e947cf1c7665d92d526822bd)
- feat: add additional skipped packages and improve file decoration logic [`9b4a559`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/9b4a559d8b20dbc67b89692ce7f29d44ae97ac8e)
- feat: improve file decoration with badge count and tooltip [`e940fc2`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/e940fc22e6d79c01cd6cd376f04c2ae941999eaf)
- feat: update file decoration logic to skip empty reference maps and change badge icon [`b4a501f`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/b4a501fde4303b7086c8f4056e2b6b1ed3361bd3)
- feat: remove debug logging and clean up file decoration provider logic [`038dc3e`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/038dc3eef2dbbd0f376817f7fc7cd7657f3d30b0)
- feat: add missing aliases for utils and services, enhance logging in alias resolution [`adb5cf6`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/adb5cf63dbda71f4d8e57580bd2e1c5cd4ac948c)
- feat: add logging for files with no references in file decoration provider [`e42eb4f`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/e42eb4fd94c9493d7e40b322307e043c35380106)
- chore: remove unnecessary blank lines in extension.ts [`a24de1b`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/a24de1b7429dddf2d3575b57c70697c6b4297030)
- feat: update package version to 0.0.3 and refine description in package.json [`4f20ef5`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/4f20ef58db4fcb3be47bd04a3aa854b95eef027f)
- fix: simplify condition check for badge display in decoration provider [`b0c0d98`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/b0c0d98b1476300d8156a467bd1aa6460bb183e2)
- feat: add publisher field to package.json [`bc8b4e2`](https://github.com/rand0mC0d3r/vscode-inline-imports/commit/bc8b4e2161d8ea6d46eb1342f5bc8f52816b8bac)
