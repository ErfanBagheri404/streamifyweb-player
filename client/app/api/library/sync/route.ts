import { NextRequest, NextResponse } from "next/server";
import { requireStreamifyRequest } from "../../_lib/request-guard";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

type TrackRef = {
  id: string;
  source: string;
};

type PlaylistSnapshot = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  songs: TrackRef[];
};

function sanitizeString(value: unknown, maxLength = 500): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function sanitizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function sanitizeTrackRef(value: unknown): TrackRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const id = sanitizeString(record.id, 191);
  const source = sanitizeString(record.source, 50).toLowerCase();
  if (!id || !source) return null;

  return { id, source };
}

function sanitizeTrackRefs(value: unknown, maxItems: number): TrackRef[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const output: TrackRef[] = [];

  for (const entry of value) {
    const trackRef = sanitizeTrackRef(entry);
    if (!trackRef) continue;
    const key = `${trackRef.source}:${trackRef.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(trackRef);
    if (output.length >= maxItems) break;
  }

  return output;
}

function sanitizePlaylists(value: unknown): PlaylistSnapshot[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const output: PlaylistSnapshot[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const id = sanitizeString(record.id, 191);
    const name = sanitizeString(record.name, 120);
    if (!id || !name || seen.has(id)) continue;

    seen.add(id);
    output.push({
      id,
      name,
      description: sanitizeString(record.description, 1000),
      createdAt: sanitizeNumber(record.createdAt) ?? Date.now(),
      songs: sanitizeTrackRefs(record.songs, 500),
    });

    if (output.length >= 100) break;
  }

  return output;
}

async function getAuthenticatedSupabase(request: NextRequest) {
  const blockedResponse = requireStreamifyRequest(request);
  if (blockedResponse) {
    return { response: blockedResponse, supabase: null, user: null };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        supabase: null,
        user: null,
      };
    }

    return { response: null, supabase, user };
  } catch (error) {
    return {
      response: NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Library sync failed",
        },
        { status: 500 }
      ),
      supabase: null,
      user: null,
    };
  }
}

export async function GET(request: NextRequest) {
  const { response, supabase, user } = await getAuthenticatedSupabase(request);
  if (response || !supabase || !user) {
    return response as NextResponse;
  }

  try {
    const { data: playlists, error: playlistsError } = await supabase
      .from("playlists")
      .select("id, client_playlist_id, name, description, created_at_client")
      .eq("user_id", user.id)
      .order("created_at_client", { ascending: false });

    if (playlistsError) {
      return NextResponse.json(
        { error: playlistsError.message },
        { status: 500 }
      );
    }

    const playlistIds = (playlists || [])
      .map((playlist) => (typeof playlist.id === "string" ? playlist.id : ""))
      .filter(Boolean);

    const { data: playlistTracks, error: playlistTracksError } =
      playlistIds.length > 0
        ? await supabase
            .from("playlist_tracks")
            .select("playlist_id, track_id, source")
            .in("playlist_id", playlistIds)
        : { data: [], error: null };

    if (playlistTracksError) {
      return NextResponse.json(
        { error: playlistTracksError.message },
        { status: 500 }
      );
    }

    const { data: likedTracks, error: likedTracksError } = await supabase
      .from("liked_tracks")
      .select("track_id, source")
      .eq("user_id", user.id);

    if (likedTracksError) {
      return NextResponse.json(
        { error: likedTracksError.message },
        { status: 500 }
      );
    }

    const tracksByPlaylistId = new Map<string, TrackRef[]>();
    for (const entry of playlistTracks || []) {
      const playlistId =
        typeof entry.playlist_id === "string" ? entry.playlist_id : "";
      const trackId = typeof entry.track_id === "string" ? entry.track_id : "";
      const source =
        typeof entry.source === "string"
          ? entry.source.trim().toLowerCase()
          : "";
      if (!playlistId || !trackId || !source) continue;

      const existing = tracksByPlaylistId.get(playlistId) || [];
      existing.push({ id: trackId, source });
      tracksByPlaylistId.set(playlistId, existing);
    }

    return NextResponse.json({
      playlists: (playlists || []).map((playlist) => ({
        id:
          typeof playlist.client_playlist_id === "string"
            ? playlist.client_playlist_id
            : "",
        name: typeof playlist.name === "string" ? playlist.name : "",
        description:
          typeof playlist.description === "string" ? playlist.description : "",
        createdAt:
          typeof playlist.created_at_client === "string" &&
          !Number.isNaN(Date.parse(playlist.created_at_client))
            ? Date.parse(playlist.created_at_client)
            : Date.now(),
        songs: tracksByPlaylistId.get(playlist.id) || [],
      })),
      likedSongs: (likedTracks || [])
        .map((track) => ({
          id: typeof track.track_id === "string" ? track.track_id : "",
          source:
            typeof track.source === "string"
              ? track.source.trim().toLowerCase()
              : "",
        }))
        .filter((track) => track.id && track.source),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Library restore failed",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { response, supabase, user } = await getAuthenticatedSupabase(request);
  if (response || !supabase || !user) {
    return response as NextResponse;
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const playlists = sanitizePlaylists(body.playlists);
    const likedSongs = sanitizeTrackRefs(body.likedSongs, 1000);

    const { error: deletePlaylistsError } = await supabase
      .from("playlists")
      .delete()
      .eq("user_id", user.id);

    if (deletePlaylistsError) {
      return NextResponse.json(
        { error: deletePlaylistsError.message },
        { status: 500 }
      );
    }

    if (playlists.length > 0) {
      const { error: insertPlaylistsError } = await supabase
        .from("playlists")
        .insert(
          playlists.map((playlist) => ({
            user_id: user.id,
            client_playlist_id: playlist.id,
            name: playlist.name,
            description: playlist.description,
            created_at_client: new Date(playlist.createdAt).toISOString(),
          }))
        );

      if (insertPlaylistsError) {
        return NextResponse.json(
          { error: insertPlaylistsError.message },
          { status: 500 }
        );
      }

      const { data: storedPlaylists, error: storedPlaylistsError } =
        await supabase
          .from("playlists")
          .select("id, client_playlist_id")
          .eq("user_id", user.id);

      if (storedPlaylistsError) {
        return NextResponse.json(
          { error: storedPlaylistsError.message },
          { status: 500 }
        );
      }

      const playlistIdByClientId = new Map<string, string>();
      for (const playlist of storedPlaylists || []) {
        const clientPlaylistId =
          typeof playlist.client_playlist_id === "string"
            ? playlist.client_playlist_id
            : "";
        const storedPlaylistId =
          typeof playlist.id === "string" ? playlist.id : "";
        if (clientPlaylistId && storedPlaylistId) {
          playlistIdByClientId.set(clientPlaylistId, storedPlaylistId);
        }
      }

      const playlistTracks = playlists.flatMap((playlist) => {
        const playlistId = playlistIdByClientId.get(playlist.id);
        if (!playlistId) return [];

        return playlist.songs.map((song) => ({
          playlist_id: playlistId,
          user_id: user.id,
          track_id: song.id,
          source: song.source,
        }));
      });

      if (playlistTracks.length > 0) {
        const { error: insertPlaylistTracksError } = await supabase
          .from("playlist_tracks")
          .insert(playlistTracks);

        if (insertPlaylistTracksError) {
          return NextResponse.json(
            { error: insertPlaylistTracksError.message },
            { status: 500 }
          );
        }
      }
    }

    const { error: deleteLikedTracksError } = await supabase
      .from("liked_tracks")
      .delete()
      .eq("user_id", user.id);

    if (deleteLikedTracksError) {
      return NextResponse.json(
        { error: deleteLikedTracksError.message },
        { status: 500 }
      );
    }

    if (likedSongs.length > 0) {
      const { error: insertLikedTracksError } = await supabase
        .from("liked_tracks")
        .insert(
          likedSongs.map((song) => ({
            user_id: user.id,
            track_id: song.id,
            source: song.source,
          }))
        );

      if (insertLikedTracksError) {
        return NextResponse.json(
          { error: insertLikedTracksError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      syncedPlaylists: playlists.length,
      syncedPlaylistTracks: playlists.reduce(
        (count, playlist) => count + playlist.songs.length,
        0
      ),
      syncedLikes: likedSongs.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Library sync failed",
      },
      { status: 500 }
    );
  }
}
