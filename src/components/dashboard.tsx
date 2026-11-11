"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowRight, CalendarDays, Check, Crosshair, HardDrive, Plus, RefreshCw, Search, Users, X } from "lucide-react";
import { Toaster, toast } from "sonner";
import { isValidUsername, normalizeUsername } from "@/lib/calendar/username";
import { getSupabase } from "@/lib/supabase/client";

interface Group { id: string; name: string; owner_id: string }
interface Member { user_id: string; username: string | null; is_owner: boolean }
interface Invitation { invite_id: string; group_name: string; inviter_username: string }
interface SearchResult { username: string }

export function Dashboard() {
  const client = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [profileStatus, setProfileStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const userRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!client) { setAuthLoading(false); return; }
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (active) {
        if (userRef.current !== (session?.user.id ?? null)) setBusy(false);
        userRef.current = session?.user.id ?? null;
        setUser(session?.user ?? null);
        setAuthLoading(false);
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);

  const loadProfile = useCallback(async () => {
    if (!client || !user) return;
    setProfileStatus("loading");
    const { data, error } = await client.from("user_profiles").select("username").eq("user_id", user.id).maybeSingle();
    if (userRef.current !== user.id) return;
    if (error) {
      toast.error(`Couldn't load your username: ${error.message}`);
      setProfileStatus("error");
    } else {
      setMyUsername(data?.username ?? null);
      setProfileStatus(data ? "ready" : "missing");
    }
  }, [client, user]);

  useEffect(() => {
    setMyUsername(null);
    setProfileStatus("loading");
    if (user) void loadProfile();
  }, [user, loadProfile]);

  const loadGroups = useCallback(async () => {
    if (!client || !user) return;
    setGroupsLoading(true);
    const { error: claimError } = await client.rpc("claim_group_invites");
    if (userRef.current !== user.id) return;
    if (claimError) { toast.error(`Couldn't check group invitations: ${claimError.message}`); setGroupsLoading(false); return; }
    const { data, error } = await client.from("competition_groups").select("id,name,owner_id").order("name");
    if (userRef.current !== user.id) return;
    if (error) toast.error(`Couldn't load groups: ${error.message}`);
    else setGroups(data);
    const pending = await client.rpc("list_my_group_invites");
    if (userRef.current !== user.id) return;
    if (pending.error) toast.error(`Couldn't load invitations: ${pending.error.message}`);
    else setInvitations(pending.data);
    setGroupsLoading(false);
  }, [client, user]);

  useEffect(() => {
    setGroups([]);
    setGroupsLoading(false);
    setSelected(null);
    selectedRef.current = null;
    setMembers([]);
    setInvitations([]);
    if (user && profileStatus === "ready") void loadGroups();
  }, [user, profileStatus, loadGroups]);

  useEffect(() => {
    if (!client || !selected || !user) return;
    let active = true;
    setMembers([]);
    setSearchText("");
    setSearchResults([]);
    setSearchDone(false);
    void client.rpc("group_roster", { target_group: selected }).then(({ data, error }) => {
      if (!active) return;
      if (error) toast.error(`Couldn't load group members: ${error.message}`);
      else setMembers(data);
    });
    return () => { active = false; };
  }, [client, selected, user]);

  async function authenticate(signUp: boolean) {
    if (!client || busy) return;
    if (signUp && !isValidUsername(username)) {
      toast.error("Username must be 3-24 letters, numbers, or underscores.");
      return;
    }
    setBusy(true);
    const response = signUp
      ? await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin, data: { username: normalizeUsername(username) } } })
      : await client.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (response.error) toast.error(signUp && response.error.message.toLowerCase().includes("database")
      ? "Couldn't create the account. This username may already be taken, or online setup may be incomplete."
      : response.error.message);
    else if (signUp && !response.data.session) toast.success("Check your email to confirm your account, then sign in.");
    else toast.success(signUp ? "Account created." : "Signed in.");
    if (!response.error) setPassword("");
  }

  async function chooseUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !user || busy) return;
    if (!isValidUsername(username)) {
      toast.error("Username must be 3-24 letters, numbers, or underscores.");
      return;
    }
    setBusy(true);
    const { data, error } = await client.rpc("claim_username", { desired_username: normalizeUsername(username) });
    if (userRef.current === user.id) {
      if (error) toast.error(error.code === "23505" ? "This username is already taken." : `Couldn't save username: ${error.message}`);
      else { setMyUsername(data); setProfileStatus("ready"); toast.success("Username saved."); }
      setBusy(false);
    }
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !user || busy || !groupName.trim()) return;
    setBusy(true);
    const { data, error } = await client.rpc("create_competition_group", { group_name: groupName.trim() });
    if (error) toast.error(`Couldn't create group: ${error.message}`);
    else {
      setGroupName("");
      await loadGroups();
      if (userRef.current === user.id) {
        selectedRef.current = data;
        setSelected(data);
        toast.success("Group created.");
      }
    }
    setBusy(false);
  }

  async function searchUsers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !selected || !user || busy) return;
    if (!isValidUsername(searchText)) {
      toast.error("Search with 3-24 letters, numbers, or underscores.");
      return;
    }
    const groupId = selected;
    setBusy(true);
    const { data, error } = await client.rpc("search_usernames", { search_text: normalizeUsername(searchText) });
    if (userRef.current === user.id && selectedRef.current === groupId) {
      if (error) toast.error(`Couldn't search usernames: ${error.message}`);
      else { setSearchResults(data); setSearchDone(true); }
    }
    setBusy(false);
  }

  async function invite(usernameToInvite: string) {
    if (!client || !selected || !user || busy) return;
    setBusy(true);
    const { data, error } = await client.rpc("invite_group_username", { target_group: selected, target_username: usernameToInvite });
    if (userRef.current === user.id) {
      if (error) toast.error(`Couldn't invite ${usernameToInvite}: ${error.message}`);
      else toast.success(data === "pending" ? "Invitation already pending." : "Invitation sent. They must accept it.");
    }
    setBusy(false);
  }

  async function respondToInvite(id: string, accept: boolean) {
    if (!client || !user || busy) return;
    setBusy(true);
    const { error } = await client.rpc("respond_group_invite", { invite_id: id, accept_invite: accept });
    if (userRef.current === user.id) {
      if (error) toast.error(`Couldn't respond to invitation: ${error.message}`);
      else {
        setInvitations((current) => current.filter((invitation) => invitation.invite_id !== id));
        toast.success(accept ? "You joined the group." : "Invitation declined.");
        await loadGroups();
      }
    }
    setBusy(false);
  }

  async function signOut() {
    if (!client || busy) return;
    setBusy(true);
    const { error } = await client.auth.signOut();
    if (error) toast.error(error.message);
    else toast.success("Signed out.");
    setBusy(false);
  }

  const selectedGroup = groups.find((group) => group.id === selected);
  return <div className="dashboard">
    <Toaster theme="dark" position="bottom-right" />
    <header className="dashboard-header">
      <div className="dashboard-brand"><Crosshair size={22} aria-hidden="true" /><div><strong>OPS CALENDAR</strong><span>COMPETITION PLANNING</span></div></div>
      {user && <div className="dashboard-account"><span>{myUsername ? `@${myUsername}` : user.email}</span><button className="secondary-button" onClick={() => void signOut()} disabled={busy}>SIGN OUT</button></div>}
    </header>
    <main className="dashboard-main">
      <section className="dashboard-intro">
        <p className="intro-kicker">YOUR COMMAND CENTER</p>
        <h1>Plan together.<br /><span>Stay on schedule.</span></h1>
        <p>Group operations appear in each member&apos;s private calendar.</p>
      </section>
      {!client ? <section className="dashboard-panel setup-notice">
        <h2>ONLINE SETUP REQUIRED</h2>
        <p>Connect Supabase to enable accounts and groups. See the project README.</p>
      </section> : authLoading ? <section className="dashboard-panel" role="status">LOADING ACCOUNT...</section> : !user ? <section className="dashboard-panel auth-panel">
        <div><p className="intro-kicker">ACCOUNT ACCESS</p><h2>{authMode === "signup" ? "Create your account" : "Welcome back"}</h2><p>{authMode === "signup" ? "Choose a unique username so teammates can find you." : "Sign in to access your calendar and groups."}</p></div>
        <form onSubmit={(event) => { event.preventDefault(); void authenticate(authMode === "signup"); }} className="dashboard-form">
          {authMode === "signup" && <label className="form-field"><span>USERNAME</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" placeholder="e.g. team_ace" aria-describedby="username-help" required /><small id="username-help">3-24 letters, numbers, or underscores. Usernames are searchable and cannot be changed.</small></label>}
          <label className="form-field"><span>EMAIL</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          <label className="form-field"><span>PASSWORD</span><input type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /></label>
          <div className="dashboard-actions"><button className="save-button" disabled={busy} type="submit">{authMode === "signup" ? "CREATE ACCOUNT" : "SIGN IN"} <ArrowRight size={15} aria-hidden="true" /></button><button className="secondary-button" disabled={busy} type="button" onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}>{authMode === "signup" ? "BACK TO SIGN IN" : "CREATE ACCOUNT"}</button></div>
          <p>New accounts may require email confirmation.</p>
        </form>
      </section> : profileStatus === "loading" ? <section className="dashboard-panel" role="status">LOADING PROFILE...</section> : profileStatus === "error" ? <section className="dashboard-panel"><h2>Unable to load your profile</h2><p>Check your connection and database setup.</p><button className="secondary-button" onClick={() => void loadProfile()}>RETRY</button></section> : profileStatus === "missing" ? <section className="dashboard-panel auth-panel">
        <div><p className="intro-kicker">ACCOUNT SETUP</p><h2>Choose your username</h2><p>Your existing account needs a unique username for group invitations.</p></div>
        <form onSubmit={(event) => void chooseUsername(event)} className="dashboard-form">
          <label className="form-field"><span>USERNAME</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" placeholder="e.g. team_ace" aria-describedby="claim-username-help" required /><small id="claim-username-help">3-24 letters, numbers, or underscores. Usernames are searchable and cannot be changed.</small></label>
          <button className="save-button" disabled={busy} type="submit">SAVE USERNAME</button>
        </form>
      </section> : <>
        {invitations.length > 0 && <section className="dashboard-panel invitation-panel" aria-labelledby="invites-heading">
          <div className="panel-heading"><div><p className="intro-kicker">TEAM REQUESTS</p><h2 id="invites-heading">Invitations <span>{invitations.length}</span></h2></div></div>
          <div className="group-list">{invitations.map((invitation) => <div className="group-row" key={invitation.invite_id}><Users size={19} aria-hidden="true" /><div><strong>{invitation.group_name}</strong><small>FROM {invitation.inviter_username === "group owner" ? "GROUP OWNER" : `@${invitation.inviter_username}`}</small></div><button className="secondary-button action-with-icon" disabled={busy} aria-label={`Decline invitation to ${invitation.group_name}`} onClick={() => void respondToInvite(invitation.invite_id, false)}><X size={14} aria-hidden="true" /> DECLINE</button><button className="save-button action-with-icon" disabled={busy} aria-label={`Accept invitation to ${invitation.group_name}`} onClick={() => void respondToInvite(invitation.invite_id, true)}><Check size={14} aria-hidden="true" /> ACCEPT</button></div>)}</div>
        </section>}
        <section className="dashboard-grid">
          <Link className="dashboard-card private-card" href="/calendar">
            <CalendarDays size={23} aria-hidden="true" /><span className="card-kicker">YOUR SCHEDULE</span><h2>My calendar</h2>
            <p>Private and group operations in one place.</p><span className="card-link">OPEN CALENDAR <ArrowRight size={15} aria-hidden="true" /></span>
          </Link>
          <div className="dashboard-card create-group-card">
            <Users size={23} aria-hidden="true" /><span className="card-kicker">NEW COMPETITION</span><h2>Create a group</h2>
            <p>Name your group and add teammates.</p>
            <form onSubmit={(event) => void createGroup(event)} className="inline-form">
              <label className="sr-only" htmlFor="group-name">Group name</label><input id="group-name" value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={100} placeholder="e.g. Regional finals" required />
              <button className="save-button action-with-icon" disabled={busy} type="submit"><Plus size={15} aria-hidden="true" /> CREATE</button>
            </form>
          </div>
        </section>
        <section className="dashboard-panel">
          <div className="panel-heading"><div><p className="intro-kicker">TEAM WORKSPACES</p><h2>Your groups <span>{groups.length}</span></h2></div><button className="secondary-button action-with-icon" onClick={() => void loadGroups()} disabled={groupsLoading}><RefreshCw size={14} aria-hidden="true" /> REFRESH</button></div>
          {groupsLoading ? <p role="status">LOADING GROUPS...</p> : groups.length === 0 ? <p>No groups yet. Create one or ask an owner to add you.</p> : <div className="group-list">
            {groups.map((group) => <div key={group.id} className="group-row"><Users size={19} aria-hidden="true" /><div><strong>{group.name}</strong><small>{group.owner_id === user.id ? "OWNER" : "MEMBER"}</small></div><button className="secondary-button action-with-icon" aria-expanded={selected === group.id} aria-controls={selected === group.id ? "group-members" : undefined} onClick={() => { const next = selected === group.id ? null : group.id; selectedRef.current = next; setSelected(next); }}><Users size={14} aria-hidden="true" /> {selected === group.id ? "CLOSE" : "MEMBERS"}</button><Link className="group-open" href={`/calendar?group=${encodeURIComponent(group.id)}`} aria-label={`Open ${group.name} calendar`}>OPEN <ArrowRight size={15} aria-hidden="true" /></Link></div>)}
          </div>}
          {selectedGroup && <div className="member-panel" id="group-members">
            <h3>{selectedGroup.name} / MEMBERS</h3>
            <ul>{members.map((member) => <li key={member.user_id}>{member.username ? `@${member.username}` : "Username not set"} {member.is_owner && <span>OWNER</span>}</li>)}</ul>
            {selectedGroup.owner_id === user.id && <>
              <form onSubmit={(event) => void searchUsers(event)} className="inline-form">
                <label className="sr-only" htmlFor="username-search">Search usernames</label><input id="username-search" value={searchText} onChange={(event) => { setSearchText(event.target.value); setSearchDone(false); setSearchResults([]); }} minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" placeholder="Search usernames" disabled={busy} required />
                <button className="save-button action-with-icon" disabled={busy}><Search size={15} aria-hidden="true" /> SEARCH</button>
              </form>
              {searchDone && (searchResults.length ? <ul className="search-results">{searchResults.map((result) => <li key={result.username}><span>@{result.username}</span><button className="secondary-button action-with-icon" disabled={busy} aria-label={`Invite ${result.username}`} onClick={() => void invite(result.username)}><Plus size={14} aria-hidden="true" /> INVITE</button></li>)}</ul> : <p>No usernames found.</p>)}
            </>}
            <p>Members can edit shared operations. Invitations appear in the recipient&apos;s account and must be accepted. No email is sent.</p>
          </div>}
        </section>
      </>}
      <div className="offline-entry"><Link href="/calendar?local=1"><HardDrive size={14} aria-hidden="true" /> DEVICE CALENDAR <ArrowRight size={14} aria-hidden="true" /></Link><p>On this device only. Not synced with your account.</p></div>
    </main>
  </div>;
}
