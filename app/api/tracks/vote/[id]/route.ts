import { NextRequest, NextResponse } from "next/server";
import connectDb from "@/lib/mongodb";
import Track from "@/models/track";
import { authOptions } from "@/app/api/auth/auth-options";
import { getServerSession, Session } from "next-auth";
import User from "@/models/user";

interface UserDocument {
  _id: string;
  email: string;
  votedTracks: string[];
  remainingVotes: number;
  lastVoteRefresh: Date;
  isAdmin: boolean;
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions) as Session;
    const { id: trackId } = await props.params;

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      );
    }

    await connectDb();
    const user = await User.findOne({ email: session.user.email }) as UserDocument | null;

    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    if (user.remainingVotes <= 0 && !user.isAdmin) {
      return NextResponse.json(
        { error: "Vous n'avez plus de votes disponibles" },
        { status: 400 }
      );
    }

    if (user.votedTracks.includes(trackId)) {
      return NextResponse.json(
        { error: "Vous avez déjà voté pour ce track" },
        { status: 400 }
      );
    }

    const [updatedTrack, updatedUser] = await Promise.all([
      Track.findByIdAndUpdate(trackId, { $inc: { votes: 1 } }, { new: true }),
      User.findOneAndUpdate(
        { email: session?.user?.email },
        { 
          $push: { votedTracks: trackId },
          $inc: { remainingVotes: -1 }
        },
        { new: true }
      )
    ]);
    if (!updatedTrack) {
      return NextResponse.json({ error: "Track non trouvé" }, { status: 404 });
    }

    return NextResponse.json({
      track: updatedTrack,
      votedTracks: updatedUser?.votedTracks,
      remainingVotes: updatedUser?.remainingVotes
    });
  } catch (error) {
    console.error("Erreur lors du vote", error);
    return NextResponse.json({ error: "Erreur lors du vote" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const trackId = params.id;
    const session = (await getServerSession(authOptions)) as Session | null;

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Vous devez être connecté pour retirer votre vote" },
        { status: 401 }
      );
    }

    await connectDb();

    const user = await User.findOne({ email: session?.user?.email });
    if (!user?.votedTracks.includes(trackId)) {
      return NextResponse.json(
        { error: "Vous n'avez pas voté pour ce track" },
        { status: 400 }
      );
    }

    const [updatedTrack, updatedUser] = await Promise.all([
      Track.findByIdAndUpdate(trackId, { $inc: { votes: -1 } }, { new: true }),
      User.findOneAndUpdate(
        { email: session?.user?.email },
        { $pull: { votedTracks: trackId } },
        { new: true }
      ),
    ]);

    if (!updatedTrack) {
      return NextResponse.json({ error: "Track non trouvé" }, { status: 404 });
    }

    return NextResponse.json({
      track: updatedTrack,
      votedTracks: updatedUser?.votedTracks,
    });
  } catch (error) {
    console.error("Erreur lors de la suppression du vote", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression du vote" },
      { status: 500 }
    );
  }
}
