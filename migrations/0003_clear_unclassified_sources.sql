-- A campaign without a category must never imply offline traffic.
UPDATE sources s SET category=''
FROM campaigns c WHERE s.campaign_id=c.id AND c.category IS NULL AND s.category<>'';
