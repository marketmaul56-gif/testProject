# Upload to GitHub

Target repository currently identified in this project:

`marketmaul56-gif/testProject`

## Option A — GitHub web upload

1. Extract the ZIP locally.
2. Open the repository.
3. Upload the **contents of the extracted folder**, not the parent folder itself.
4. Commit to `main` with message:
   `chore: initialize M12 implementation workspace`

## Option B — Git command line

```bash
git clone https://github.com/marketmaul56-gif/testProject.git
cd testProject
# copy all extracted files into this folder
git add .
git commit -m "chore: initialize M12 implementation workspace"
git push origin main
```

After upload, the next action is to recover the LOCKED M3/M4 baseline, then continue M12.1 against real repository content.
