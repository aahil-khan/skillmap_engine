# Future Plans: Machine Learning for Peer Matching

## Overview
This document outlines the long-term ML-powered approach to replace hardcoded scoring weights with learned patterns from user behavior.

---

## Phase 1: Data Collection (Current Phase)
**Goal**: Gather user interaction data to train models later

### Metrics to Track:
1. **Match Interactions**:
   - User sees profile → `match_impression` event
   - User clicks profile → `match_view` event
   - User sends connection request → `connection_initiated` event
   - User accepts/rejects request → `connection_accepted/rejected` event

2. **Connection Quality**:
   - Messages exchanged count
   - Session duration (time spent chatting)
   - Peer session completed (did they actually meet/work together?)
   - User feedback rating (1-5 stars after session)

3. **Negative Signals**:
   - User blocks/reports peer
   - No response to messages (ghosting)
   - Connection ended prematurely

### Database Schema Addition:
```sql
-- Track all match impressions and interactions
CREATE TABLE match_interactions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  candidate_id UUID REFERENCES auth.users(id),
  event_type TEXT, -- 'impression', 'view', 'request', 'accept', 'reject', 'message', 'block'
  scoring_factors JSONB, -- snapshot of factors at time of match
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track connection outcomes
CREATE TABLE connection_outcomes (
  connection_id UUID REFERENCES peer_connections(id),
  messages_count INT,
  session_duration_minutes INT,
  user_rating INT CHECK (user_rating BETWEEN 1 AND 5),
  peer_rating INT CHECK (peer_rating BETWEEN 1 AND 5),
  outcome TEXT, -- 'successful', 'ghosted', 'blocked', 'inactive'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Phase 2: Feature Engineering
**Goal**: Convert user profiles into ML-friendly features

### Features to Extract:
1. **User Features**:
   - Skill count, average skill level
   - Experience level (encoded as number)
   - Activity level (logins per week, response rate)
   - Profile completeness score
   - Learning goal specificity (vague vs detailed)

2. **Pair Features** (User A + User B):
   - Shared skill count (weighted by value_weight)
   - Skill level difference distribution
   - Domain overlap score
   - Goal semantic similarity (vector distance)
   - Experience gap
   - Timezone compatibility
   - Availability overlap

3. **Behavioral Features**:
   - User A's historical accept rate
   - User B's historical response rate
   - Average rating received by each user

---

## Phase 3: Model Training
**Goal**: Predict match success probability

### Approach Options:

#### Option A: Binary Classification
**Predict**: Will this match lead to a successful connection?

- **Input**: Feature vector (30-50 features from Phase 2)
- **Output**: Probability (0-1) of successful connection
- **Label**: 1 if connection accepted + at least 3 messages exchanged, 0 otherwise
- **Models to try**:
  - XGBoost (fast, interpretable)
  - Random Forest
  - Neural Network (if enough data)

#### Option B: Learning to Rank
**Predict**: Best ordering of candidate list for each user

- **Input**: (query user, candidate user, features)
- **Output**: Relevance score
- **Training**: Pairwise ranking loss (prefer accepted over rejected)
- **Models**:
  - LambdaMART
  - RankNet
  - Transformer-based ranker

#### Option C: Collaborative Filtering (If scale permits)
**Predict**: User preferences based on similar users

- If User A and User B both liked User C, recommend users that B liked to A
- Requires significant user base (1000+ active users)

---

## Phase 4: Online Deployment

### Hybrid Approach (Recommended):
```
1. Vector search (Qdrant) → 200 candidates (fast, recall-focused)
2. ML model scoring → rank all 200 (batch inference, ~50ms)
3. Apply diversity filters → ensure variety in top results
4. Return ranked list for Tinder-style UI
```

### A/B Testing:
- **Control Group**: Current multi-factor scoring
- **Treatment Group**: ML-powered scoring
- **Metrics**: Connection rate, message rate, user satisfaction

### Model Monitoring:
- Track prediction accuracy over time
- Detect model drift (user preferences change)
- Retrain monthly with new data

---

## Phase 5: Personalization

### User-Specific Models:
Once enough data per user:
- Learn individual user preferences
- "Alice prefers mentors with 5+ years experience"
- "Bob ignores matches without availability overlap"

### Contextual Ranking:
Adjust recommendations based on:
- Time of day (morning = quick code review, evening = deep dive sessions)
- Recent activity (just completed a project = looking for new collaborators)
- Learning goal progress (stuck on GraphQL = prioritize GraphQL experts)

---

## Cost & Complexity Analysis

### Data Collection (Phase 1):
- **Cost**: Minimal (just DB writes)
- **Timeline**: 3-6 months to gather sufficient data
- **Complexity**: Low (add event tracking to existing flows)

### Model Training (Phase 3):
- **Cost**: ~$50-200 for compute (one-time per training run)
- **Timeline**: 2-4 weeks to experiment with models
- **Complexity**: Medium (requires ML expertise)

### Deployment (Phase 4):
- **Cost**: ~$0.001 per match scored (vs $0.01+ for LLM reranking)
- **Latency**: <100ms for batch scoring
- **Complexity**: Medium (model serving infrastructure)

---

## Success Metrics

### Product Metrics:
- **Connection Rate**: % of impressions → connections (target: 15-20%)
- **Response Rate**: % of requests that get responses (target: 60%+)
- **Session Completion**: % of connections that complete at least 1 peer session (target: 40%+)
- **Retention**: % of users who return weekly (target: 50%+)

### Model Metrics:
- **Precision@10**: % of top 10 matches that get accepted
- **AUC**: Area under ROC curve for classification
- **NDCG**: Normalized discounted cumulative gain for ranking

---

## Migration Path

### Phase 1 (Now - Month 3):
- Implement user preference weights (quick win)
- Add event tracking for all match interactions
- Collect baseline metrics

### Phase 2 (Month 3-6):
- Analyze collected data
- Build feature engineering pipeline
- Train initial models offline

### Phase 3 (Month 6-9):
- Deploy ML model alongside current system
- A/B test with 10% of users
- Iterate based on results

### Phase 4 (Month 9-12):
- Full rollout if metrics improve
- Add personalization layer
- Continuous retraining pipeline

---

## Open Questions

1. **Minimum data threshold**: How many interactions needed before ML is better than heuristics?
   - Estimate: 1000+ connections, 5000+ match views

2. **Cold start problem**: How to handle new users with no interaction history?
   - Use content-based features only (skills, goals, experience)
   - Gradually incorporate behavioral features as data accumulates

3. **Bias mitigation**: How to prevent model from amplifying existing biases?
   - Monitor demographic fairness metrics
   - Apply debiasing techniques (e.g., equalized odds)

4. **Explainability**: How to show users why they were matched?
   - Use SHAP values to explain predictions
   - Surface top contributing features in UI

---

## References & Resources

- **Learning to Rank**: [Microsoft LTR](https://www.microsoft.com/en-us/research/project/mslr/)
- **Recommendation Systems**: [RecSys Papers](https://recsys.acm.org/)
- **A/B Testing**: [Spotify's Experimentation Platform](https://engineering.atspotify.com/2020/10/spotifys-new-experimentation-platform-part-1/)

---

**Last Updated**: December 14, 2025  
**Status**: Planning Phase  
**Owner**: Engineering Team
