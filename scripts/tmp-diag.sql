select c.id, c.author_id, cv.author_username, cv.body
  from comments c
  join comments_view cv on cv.id = c.id
  where c.post_id = 'd0af533e-ce1c-43f5-b6db-535b154f9ade'
  order by c.created_at;
