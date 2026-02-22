CREATE TABLE tj_songs (
  no TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  singer TEXT NOT NULL
);
CREATE INDEX idx_tj_title ON tj_songs(title);
CREATE INDEX idx_tj_singer ON tj_songs(singer);
