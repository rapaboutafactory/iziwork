ALTER TABLE campaigns ADD COLUMN category text CHECK (category IN ('offline','online'));

-- Infer only unambiguous legacy categories. Mixed and empty campaigns keep their sources unchanged.
UPDATE campaigns c SET category=existing.category
FROM (
 SELECT campaign_id,min(category) AS category FROM sources
 WHERE campaign_id IS NOT NULL
 GROUP BY campaign_id
 HAVING count(DISTINCT category)=1 AND min(category) IN ('offline','online')
) existing WHERE c.id=existing.campaign_id;
