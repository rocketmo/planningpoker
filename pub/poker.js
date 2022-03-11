var _vm = function() {
    this.socket = null;

    this.voteCardValues = [0, 0.5, 1, 2, 3, 5, 8, 13];
    this.isResetting = ko.observable(false);

    // every user { id, name, vote() } 
    this.users = ko.observableArray();
    this.allVoted = ko.computed(function() {
        if (this.users().length == 0) {
            return false;
        }
        var ret = true;
        this.users().forEach(user => {
            if (user && user.vote() === undefined) {
                ret = false;
            }
        });

        if (ret) {
            // give it a nudge - since knockout doesn't do css vars, have to go thru DOM methods
            document.querySelectorAll('.user.card').forEach(card => {
                if (!card.style.getPropertyValue('--card-angle')) {
                    const newCardAngle = (Math.round((Math.random() * 8) - 4)) + 'deg';
                    card.style.setProperty('--card-angle', newCardAngle);
                }
            });
        }
        return ret && !this.isResetting();
    }, this);

    this.userName = ko.observable();
    this.userId = ko.observable();
    this.roomName = ko.observable();

    this.userNameLoaderVisible = ko.observable(false);
    this.loginBoxVisible = ko.observable(true);
    this.socketPreloaderVisible = ko.observable(true);

    this.onAfterLogin = function() {  };
    this.userId.subscribe(function() {
        this.onAfterLogin();
    }, this);

    // convert .vote to observable
    this.prepareUserData = function(users) {
        function prepare(data) {
            if (!data.vote || !ko.isObservable(data.vote)) {
                data.vote = ko.observable(data.vote);
            }
        }
        if (users instanceof Array) {
            users.forEach(user => {
                prepare(user);
            });
        } else {
            prepare(users);
        }
        return users;
    }

    this.init = function() {
        // replace it with another loader?
        this.prepareSocket(() => {
            this.socketPreloaderVisible(false);

            // TODO: Trigger focus on the input field
        });
    };

    this.prepareSocket = function(callback) {
        this.socket = io.connect();
        this.socket.on('connect', function() {
            callback && callback();
        });

        this.socket.on('hello', data => {
            console.log('hello', data.id);
            this.userId(data.id);
        });

        this.socket.on('server_error', data => {
            alert('Server returned error: ' + data.msg);
            this.userNameLoaderVisible(false);
        });

        this.socket.on('error', function(data) {
            console.log('socket error:', data);
        });

        this.socket.on('welcome', data => {
            console.log('welcome', data);
            this.roomName(data.roomName);
            this.users(this.prepareUserData(data.users));
            this.userNameLoaderVisible(false);
            this.loginBoxVisible(false);
        });

        this.socket.on('joined', data => {
            // skip ourselves
            if (data.id == this.userId()) { 
                return;
            }

            this.users.push(this.prepareUserData(data));
        });

        this.socket.on('user_voted', data => {
            // catch voted user and set 'vote' field
            this.users().forEach(user => {
                if (user.id == data.id) {
                    user.vote(data.vote);
                }
            });
        });

        this.socket.on('reset', () => {
            // don't delay if all votes aren't tallied
            const timeoutLength = this.allVoted() ? 500 : 0;

            if (!!this._reset) {
                clearTimeout(this._reset);
                this._reset = null;
                return;
            }

            // set resetting to true for a bit before removing scores
            // to handle card flip animation
            this.isResetting(true);
            
            this._reset = setTimeout(() => {
                this.users().forEach(user => {
                    user && user.vote(undefined);
                });

                this.isResetting(false);

                // clear the nudges - since knockout doesn't do css vars, have to go thru DOM methods
                document.querySelectorAll('.userCard').forEach(card => {
                    card.style.setProperty('--card-angle', '');
                });

                this._reset = null;
            }, timeoutLength);
        });
        this._reset = null;

        this.socket.on('quit', data => {
            // remove user from list
            console.log('remove user', data);
            this.users(
                this.users().filter(user => user && user.id !== data.id)
            );
        });
    }

    this.login = function() {
        // @TODO: check this one!
        if (!/^[a-z0-9-_]+$/i.test(this.userName())) {
            return alert('Username must be [a-z0-9-_\.]+'); 
        }
        this.userNameLoaderVisible(true);
        if (!this.userId()) {
            this.socket.emit('set_name', { name: this.userName() });
        } else {
            this.userId.valueHasMutated();
        }
    }

    this.resetRoom = function() {
        this.socket.emit('reset', { roomName: this.roomName() }); 
    }

    this.showInviteDialog = function() {
        alert('not implemented');
    }

    // dom elements listeners
    this.onEnterClick = function() {
        var rn = prompt("Enter room name");
        if (!rn || /^\s*$/.test(rn)) {
            return;
        }
        this.onAfterLogin = () => {
            this.socket.emit('join', {roomName: rn});
        };
        this.login();
        // see this.userId.subsribe to follow up next steps
    }

    this.onCreateRoomClick = function() {
        this.onAfterLogin = () => { 
            this.socket.emit('join');
        };
        this.login();
        // see this.userId.subsribe to follow up next steps
    }

    this.onClickRoomNumber = function() {
        navigator.clipboard.writeText(vm.roomName());
    }

    this.onVoteCardClick = function(vote) {
        vm.socket.emit('vote', { roomName: vm.roomName(), vote: vote });
    }

}

document.addEventListener('DOMContentLoaded', () => {
    ko.applyBindings(window.vm = new _vm());
    vm.init(); 
    console.log('%cAPP READY', 'color: green');
});
