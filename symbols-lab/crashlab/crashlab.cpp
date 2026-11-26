// crashlab: a small C++ program that crashes on purpose.
//
// It is the patient for the debug symbols lab. The code is always the same,
// only the build and what was uploaded to Sentry is different, so you can see
// what every missing piece does to the stack trace.
//
//   crashlab.exe crash <run>    real access violation, crashpad writes a minidump
//   crashlab.exe divide <run>   integer divide by zero, the divisor is an argument
//   crashlab.exe error <run>    handled event with a stack trace, no minidump
//
// The crash happens inside a callback that the C runtime calls (qsort), so the
// stack goes: our code -> ucrtbase.dll -> our code -> kernel32 -> ntdll.
// This way one crash shows app frames and system frames together.
#include <sentry.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#ifndef APP_VERSION
#define APP_VERSION "dev"
#endif

struct Player {
    const char *name;
    int *scores; // nullptr for a player who never played
    int games;
};

// small helper, the optimizer inlines it. With a full PDB Sentry still shows
// it as a separate (inlined) frame.
static inline int last_score(const Player *p)
{
    return p->scores[p->games - 1]; // <- access violation when scores is null
}

static int compare_players(const void *a, const void *b)
{
    const Player *pa = static_cast<const Player *>(a);
    const Player *pb = static_cast<const Player *>(b);
    return last_score(pb) - last_score(pa);
}

class Leaderboard {
public:
    void add(const char *name, int *scores, int games)
    {
        players_.push_back(Player { name, scores, games });
    }

    __declspec(noinline) void sort()
    {
        // ucrtbase.dll calls compare_players for us
        qsort(players_.data(), players_.size(), sizeof(Player), compare_players);
    }

    __declspec(noinline) const char *winner()
    {
        sort();
        return players_.empty() ? "nobody" : players_[0].name;
    }

private:
    std::vector<Player> players_;
};

__declspec(noinline) static int finish_match(const char *run)
{
    static int alice[] = { 120, 340, 90 };
    static int bob[] = { 200, 180 };

    Leaderboard board;
    board.add("alice", alice, 3);
    board.add("bob", bob, 2);
    board.add(run, nullptr, 1); // new player, no scores yet
    printf("winner: %s\n", board.winner());
    return 0;
}

// second bug, for the registers demo: the bad value is an argument.
// Windows x64 passes total in ecx and games in edx.
__declspec(noinline) static int average_score(int total, int games)
{
    return total / games; // <- integer divide by zero when games == 0
}

__declspec(noinline) static int show_average(const char *run, int games)
{
    int total = 0;
    for (const char *c = run; *c; c++) {
        total += *c;
    }
    printf("average: %d\n", average_score(total, games));
    return 0;
}

static std::string env_or(const char *key, const char *fallback)
{
    const char *v = getenv(key);
    return v && *v ? v : fallback;
}

int main(int argc, char **argv)
{
    const char *kind = argc > 1 ? argv[1] : "crash";
    const char *run = argc > 2 ? argv[2] : "manual";

    sentry_options_t *options = sentry_options_new();
    sentry_options_set_dsn(options, getenv("SENTRY_DSN"));
    sentry_options_set_release(options, env_or("SENTRY_RELEASE", "crashlab@" APP_VERSION).c_str());
    sentry_options_set_environment(options, env_or("SENTRY_ENVIRONMENT", "lab").c_str());
    sentry_options_set_database_path(options, env_or("CRASHLAB_DB", ".sentry-native").c_str());
    sentry_options_set_debug(options, getenv("CRASHLAB_DEBUG") != nullptr);
    sentry_init(options);

    sentry_set_tag("run_id", run);
    sentry_set_tag("scenario", env_or("CRASHLAB_SCENARIO", "manual").c_str());

    if (kind[0] == 'c') {
        printf("crashlab %s: crashing, crashpad writes the minidump...\n", APP_VERSION);
        fflush(stdout);
        return finish_match(run);
    }

    if (kind[0] == 'd') {
        printf("crashlab %s: dividing by zero...\n", APP_VERSION);
        fflush(stdout);
        return show_average(run, argc - 3); // 3 args on the command line -> 0 games
    }

    sentry_value_t event = sentry_value_new_event();
    sentry_value_t exc = sentry_value_new_exception("SaveError", "could not write save file");
    sentry_value_set_stacktrace(exc, nullptr, 0);
    sentry_event_add_exception(event, exc);
    sentry_uuid_t id = sentry_capture_event(event);
    char buf[37];
    sentry_uuid_as_string(&id, buf);
    printf("event id: %s\n", buf);
    sentry_close();
    return 0;
}
