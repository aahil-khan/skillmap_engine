# 1. Create develop branch from Phase 1
git checkout implement_phase_1_refactor
git checkout -b develop
git push -u origin develop

# 2. Branch Phase 2 from develop
git checkout -b phase_2_refactor
# ... build Phase 2 ...
git checkout develop
git merge phase_2_refactor
git push origin develop

# 3. Repeat for Phase 3, 4, 5
git checkout -b phase_3_refactor
# ... build Phase 3 ...
git checkout develop
git merge phase_3_refactor

# 4. After all phases + testing complete
git checkout main
git merge develop
git push origin main