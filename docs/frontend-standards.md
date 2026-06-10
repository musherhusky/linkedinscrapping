---
description: Frontend standards — N/A for this project.
alwaysApply: false
---

# Frontend Standards

## N/A — Backend-Only Project

This is a pure backend project. There is no frontend, no React, no bundler, and no UI framework.

All user-facing interfaces (admin dashboard, analytics) are maintained in a separate repository.

**Do not create frontend files in this repository.**

If you need to expose data for a frontend, add a new endpoint in `api/` following the patterns in [Backend Standards](./backend-standards.md).
